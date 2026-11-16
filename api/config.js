'use strict';
const L = require('./_lib');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ origins: L.allowedOrigins(), minAge: L.MIN_AGE }));
};
