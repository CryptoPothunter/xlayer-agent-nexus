/**
 * OKX Authentication Unit Tests
 * Tests for HMAC-SHA256 signature generation, timestamp format,
 * header construction, and URL encoding.
 *
 * Run: node --test tests/okx-auth.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// --- Extracted pure logic from server.js for unit testing ---

// Query string builder (exact copy from server.js)
function qs(obj) {
  return Object.entries(obj)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

// HMAC-SHA256 signature generator (exact copy from server.js)
function sign(secretKey, timestamp, method, requestPath, body) {
  let queryStr = '';
  if (method === 'GET' && body && Object.keys(body).length > 0) queryStr = '?' + qs(body);
  if (method === 'POST' && body) queryStr = JSON.stringify(body);
  const preHash = timestamp + method + requestPath + queryStr;
  return crypto.createHmac('sha256', secretKey).update(preHash).digest('base64');
}

// Timestamp generator (exact copy from server.js)
function generateTimestamp() {
  return new Date().toISOString().slice(0, -5) + 'Z';
}

// Header builder (mirrors okxRequest logic)
function buildHeaders(apiKey, secretKey, passphrase, projectId, timestamp, method, path, params) {
  const signature = sign(secretKey, timestamp, method, path, params);
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'OK-ACCESS-PROJECT': projectId,
  };
}

// ERC-20 transfer calldata builder (exact copy from server.js)
function buildTransferCalldata(to, amount) {
  const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6));
  const selector = 'a9059cbb';
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = amountRaw.toString(16).padStart(64, '0');
  return '0x' + selector + paddedTo + paddedAmount;
}

// --- Tests ---

describe('HMAC-SHA256 Signature Generation', () => {
  const testSecret = 'test-secret-key-abc123';

  it('produces a base64-encoded signature', () => {
    const sig = sign(testSecret, '2025-01-01T00:00:00Z', 'GET', '/api/v6/dex/quote', {});
    // Base64 pattern: alphanumeric + / + = padding
    assert.match(sig, /^[A-Za-z0-9+/]+=*$/);
  });

  it('produces consistent output for same input', () => {
    const ts = '2025-01-01T12:00:00Z';
    const sig1 = sign(testSecret, ts, 'GET', '/api/v6/dex/quote', { chainIndex: '196' });
    const sig2 = sign(testSecret, ts, 'GET', '/api/v6/dex/quote', { chainIndex: '196' });
    assert.equal(sig1, sig2);
  });

  it('produces different signatures for different timestamps', () => {
    const sig1 = sign(testSecret, '2025-01-01T00:00:00Z', 'GET', '/api/v6/dex/quote', {});
    const sig2 = sign(testSecret, '2025-01-01T00:00:01Z', 'GET', '/api/v6/dex/quote', {});
    assert.notEqual(sig1, sig2);
  });

  it('produces different signatures for different secrets', () => {
    const ts = '2025-01-01T00:00:00Z';
    const sig1 = sign('secret-one', ts, 'GET', '/api/v6/dex/quote', {});
    const sig2 = sign('secret-two', ts, 'GET', '/api/v6/dex/quote', {});
    assert.notEqual(sig1, sig2);
  });

  it('includes query string in GET pre-hash', () => {
    const ts = '2025-01-01T00:00:00Z';
    const sigWithParams = sign(testSecret, ts, 'GET', '/api/v6/dex/quote', { a: '1' });
    const sigWithoutParams = sign(testSecret, ts, 'GET', '/api/v6/dex/quote', {});
    assert.notEqual(sigWithParams, sigWithoutParams);
  });

  it('includes JSON body in POST pre-hash', () => {
    const ts = '2025-01-01T00:00:00Z';
    const sigWithBody = sign(testSecret, ts, 'POST', '/api/v6/security/scan', { token: '0xabc' });
    const sigWithoutBody = sign(testSecret, ts, 'POST', '/api/v6/security/scan', null);
    assert.notEqual(sigWithBody, sigWithoutBody);
  });

  it('GET with no params appends no query string', () => {
    // Manually verify: preHash should be timestamp+GET+path with no ?
    const ts = '2025-06-01T00:00:00Z';
    const path = '/api/v6/dex/tokens';
    const preHash = ts + 'GET' + path;
    const expected = crypto.createHmac('sha256', testSecret).update(preHash).digest('base64');
    const actual = sign(testSecret, ts, 'GET', path, {});
    assert.equal(actual, expected);
  });

  it('POST with body uses JSON.stringify in pre-hash', () => {
    const ts = '2025-06-01T00:00:00Z';
    const path = '/api/v6/security/token-scan';
    const body = { source: 'api', tokenList: [{ chainId: '196', contractAddress: '0xabc' }] };
    const preHash = ts + 'POST' + path + JSON.stringify(body);
    const expected = crypto.createHmac('sha256', testSecret).update(preHash).digest('base64');
    const actual = sign(testSecret, ts, 'POST', path, body);
    assert.equal(actual, expected);
  });
});

describe('Timestamp Format', () => {
  it('produces ISO 8601 format ending with Z', () => {
    const ts = generateTimestamp();
    assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('does not include milliseconds', () => {
    const ts = generateTimestamp();
    assert.ok(!ts.includes('.'), 'Timestamp should not contain milliseconds');
  });

  it('generates timestamps close to current time', () => {
    const ts = generateTimestamp();
    const parsed = new Date(ts).getTime();
    const now = Date.now();
    // Should be within 2 seconds of current time
    assert.ok(Math.abs(now - parsed) < 2000, 'Timestamp should be within 2s of now');
  });

  it('successive calls produce non-decreasing timestamps', () => {
    const ts1 = generateTimestamp();
    const ts2 = generateTimestamp();
    assert.ok(new Date(ts2).getTime() >= new Date(ts1).getTime());
  });
});

describe('Header Construction', () => {
  const apiKey = 'test-api-key';
  const secretKey = 'test-secret';
  const passphrase = 'test-pass';
  const projectId = 'test-project';
  const ts = '2025-01-01T00:00:00Z';

  it('includes all required OKX headers', () => {
    const headers = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    assert.ok('OK-ACCESS-KEY' in headers);
    assert.ok('OK-ACCESS-SIGN' in headers);
    assert.ok('OK-ACCESS-TIMESTAMP' in headers);
    assert.ok('OK-ACCESS-PASSPHRASE' in headers);
    assert.ok('OK-ACCESS-PROJECT' in headers);
    assert.ok('Content-Type' in headers);
  });

  it('sets correct Content-Type', () => {
    const headers = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    assert.equal(headers['Content-Type'], 'application/json');
  });

  it('passes API key unchanged', () => {
    const headers = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    assert.equal(headers['OK-ACCESS-KEY'], apiKey);
  });

  it('passes timestamp unchanged', () => {
    const headers = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    assert.equal(headers['OK-ACCESS-TIMESTAMP'], ts);
  });

  it('produces a valid signature in headers', () => {
    const headers = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    assert.match(headers['OK-ACCESS-SIGN'], /^[A-Za-z0-9+/]+=*$/);
  });

  it('different methods produce different signatures', () => {
    const hGet = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'GET', '/api/test', {});
    const hPost = buildHeaders(apiKey, secretKey, passphrase, projectId, ts, 'POST', '/api/test', { foo: 'bar' });
    assert.notEqual(hGet['OK-ACCESS-SIGN'], hPost['OK-ACCESS-SIGN']);
  });
});

describe('URL Encoding (qs)', () => {
  it('encodes simple key-value pairs', () => {
    const result = qs({ a: '1', b: '2' });
    assert.equal(result, 'a=1&b=2');
  });

  it('encodes special characters', () => {
    const result = qs({ address: '0x1E4a&test', value: 'hello world' });
    assert.ok(result.includes('0x1E4a%26test'));
    assert.ok(result.includes('hello%20world'));
  });

  it('encodes empty object to empty string', () => {
    const result = qs({});
    assert.equal(result, '');
  });

  it('preserves order of keys', () => {
    const result = qs({ z: '1', a: '2', m: '3' });
    assert.equal(result, 'z=1&a=2&m=3');
  });

  it('encodes unicode characters', () => {
    const result = qs({ name: '中文' });
    assert.ok(result.includes('%'));
    assert.ok(result.startsWith('name='));
  });

  it('handles numeric values as strings', () => {
    const result = qs({ chainIndex: '196', amount: '1000000' });
    assert.equal(result, 'chainIndex=196&amount=1000000');
  });
});

describe('Transfer Calldata Builder', () => {
  it('produces 0x-prefixed hex string', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '0.005');
    assert.ok(data.startsWith('0x'));
  });

  it('uses correct ERC-20 transfer selector (a9059cbb)', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '0.005');
    assert.equal(data.slice(2, 10), 'a9059cbb');
  });

  it('pads address to 32 bytes (64 hex chars)', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '0.005');
    const addressPart = data.slice(10, 74);
    assert.equal(addressPart.length, 64);
    assert.ok(addressPart.endsWith('48b62ffa1e2c68ccc4375955efc97091393db1d5'));
  });

  it('encodes correct USDT amount (6 decimals)', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '1.0');
    // 1.0 USDT = 1000000 = 0xF4240
    const amountPart = data.slice(74);
    assert.equal(amountPart.length, 64);
    const amountBigInt = BigInt('0x' + amountPart);
    assert.equal(amountBigInt, 1000000n);
  });

  it('encodes 0.005 USDT correctly', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '0.005');
    const amountPart = data.slice(74);
    const amountBigInt = BigInt('0x' + amountPart);
    assert.equal(amountBigInt, 5000n); // 0.005 * 1e6 = 5000
  });

  it('total calldata length is correct (4 + 32 + 32 bytes = 136 hex + 2 for 0x)', () => {
    const data = buildTransferCalldata('0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5', '0.01');
    // 0x + 8 (selector) + 64 (address) + 64 (amount) = 138
    assert.equal(data.length, 138);
  });
});
