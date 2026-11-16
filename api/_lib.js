'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const { Redis } = require('@upstash/redis');
const scrypt = promisify(crypto.scrypt);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const MIN_AGE = 14; // consenso digitale in Italia (art. 2-quinquies D.Lgs. 196/2003)
const SESSION_TTL = 60 * 60 * 24 * 30;
const COOKIE = 'aid_session';
const TERMS_VERSION = '2026-11-16';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function methodOnly(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  send(res, 405, { error: 'Metodo non consentito.' });
  return false;
}

// Protezione CSRF: le richieste dal browser devono arrivare dallo stesso sito.
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // client nativi o server-to-server
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) || 'unknown';
  return sha(ip).slice(0, 24); // l'IP non viene mai salvato in chiaro
}

async function limit(key, max, windowSec) {
  const k = 'rl:' + key;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  return n <= max;
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return 's1$' + salt.toString('hex') + '$' + key.toString('hex');
}

async function verifyPassword(pw, stored) {
  const [v, saltHex, hashHex] = String(stored || '').split('$');
  if (v !== 's1' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

let DUMMY;
async function dummyVerify(pw) { // stesso tempo di risposta se l'utente non esiste
  DUMMY = DUMMY || (await hashPassword('artic-dummy'));
  await verifyPassword(pw, DUMMY);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

async function createSession(uid) {
  const token = crypto.randomBytes(32).toString('base64url');
  const h = sha(token);
  await redis.set('sess:' + h, { uid }, { ex: SESSION_TTL });
  await redis.sadd('usess:' + uid, h);
  await redis.expire('usess:' + uid, SESSION_TTL);
  return token;
}

function tokenFrom(req) {
  const a = String(req.headers.authorization || '');
  if (a.startsWith('Bearer ')) return a.slice(7).trim();
  return parseCookies(req)[COOKIE] || null;
}

async function getSession(req) {
  const t = tokenFrom(req);
  if (!t) return null;
  const h = sha(t);
  const s = await redis.get('sess:' + h);
  return s && s.uid ? { uid: s.uid, hash: h } : null;
}

async function destroySession(sess) {
  await redis.del('sess:' + sess.hash);
  await redis.srem('usess:' + sess.uid, sess.hash);
}

async function destroyUserSessions(uid) {
  const hs = await redis.smembers('usess:' + uid);
  if (hs && hs.length) await redis.del(...hs.map((h) => 'sess:' + h));
  await redis.del('usess:' + uid);
}

const getUser = (uid) => redis.get('user:' + uid);

const publicUser = (u) => ({ aid: u.aid, nick: u.nick, email: u.email, createdAt: u.createdAt });

function ageFrom(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return null;
  const b = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(b) || b.getUTCDate() !== +m[3]) return null;
  const n = new Date();
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() ||
     (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return a >= 0 && a <= 120 ? a : null;
}

function newAid() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return 'AID-' + s.slice(0, 4) + '-' + s.slice(4);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NICK_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const passwordOk = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;

function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function cors(req, res) {
  const o = req.headers.origin;
  if (o && allowedOrigins().includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

module.exports = {
  redis, crypto, send, methodOnly, sameOrigin, ipKey, limit, sha, hashPassword, verifyPassword,
  dummyVerify, setSessionCookie, clearSessionCookie, createSession, getSession, destroySession,
  destroyUserSessions, getUser, publicUser, ageFrom, newAid, EMAIL_RE, NICK_RE, passwordOk,
  allowedOrigins, cors, body, MIN_AGE, TERMS_VERSION,
};
