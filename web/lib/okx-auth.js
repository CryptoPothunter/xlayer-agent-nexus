/**
 * OKX Authentication — HMAC-SHA256 signing and request helper
 */
const crypto = require('crypto');
const { API_KEY, SECRET_KEY, PASSPHRASE, PROJECT_ID, BASE_URL } = require('./config');

function qs(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

function sign(timestamp, method, requestPath, body) {
  let queryStr = '';
  if (method === 'GET' && body && Object.keys(body).length > 0) queryStr = '?' + qs(body);
  if (method === 'POST' && body) queryStr = JSON.stringify(body);
  const preHash = timestamp + method + requestPath + queryStr;
  return crypto.createHmac('sha256', SECRET_KEY).update(preHash).digest('base64');
}

async function okxRequest(method, apiPath, params) {
  const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
  const signature = sign(timestamp, method, apiPath, params);
  let url = BASE_URL + apiPath;
  const headers = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    'OK-ACCESS-PROJECT': PROJECT_ID,
  };
  const opts = { method, headers };
  if (method === 'GET' && params && Object.keys(params).length > 0) url += '?' + qs(params);
  if (method === 'POST' && params) opts.body = JSON.stringify(params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  opts.signal = ctrl.signal;
  try {
    const resp = await fetch(url, opts);
    clearTimeout(timer);
    return await resp.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

module.exports = { qs, sign, okxRequest };
