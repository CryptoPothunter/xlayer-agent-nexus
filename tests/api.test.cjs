/**
 * API Integration Tests
 * Tests HTTP endpoints of the Agent Nexus server.
 * These tests start a minimal mock server that mirrors server.js routing logic,
 * then exercise the endpoints without requiring real OKX API credentials.
 *
 * Run: node --test tests/api.test.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// --- Minimal mock server that mirrors server.js route structure ---

const SERVICE_CATALOG = {
  'token-scanner': { name: 'TokenScanner', price: '0.005', currency: 'USDT', description: 'Comprehensive security scan' },
  'swap-optimizer': { name: 'SwapOptimizer', price: '0.01', currency: 'USDT', description: 'Multi-route swap optimization' },
  'price-alert': { name: 'PriceAlert', price: '0.003', currency: 'USDT', description: 'Real-time price monitoring' },
};

const routes = {};

// Chat endpoint
routes['POST /api/chat'] = async (_, body) => {
  const message = body.message || body.input || '';
  if (!message) return { code: 400, msg: 'Missing message' };
  const lower = message.toLowerCase();
  let intent = 'general';
  if (/swap|exchange|trade|convert/.test(lower)) intent = 'swap';
  else if (/scan|security/.test(lower)) intent = 'security_scan';
  else if (/help/.test(lower)) intent = 'help';
  return {
    code: '0',
    data: {
      intent,
      entities: {},
      steps: [{ action: intent, status: 'done' }],
      response: `Processed: ${message}`,
      sessionId: 'test_session',
      history: [],
    },
  };
};

// Multi-agent demo endpoint
routes['POST /api/demo/multi-agent'] = async (_, body) => {
  const tokenAddress = body.tokenAddress || '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
  return {
    code: '0',
    data: {
      timeline: [
        { agent: 'SwapOptimizer', action: 'Discovers TokenScanner service on-chain', time: 0 },
        { agent: 'TokenScanner', action: 'Executes security scan', data: { riskLevel: 'low' }, time: 50 },
        { agent: 'SwapOptimizer', action: 'Fetches optimal route from 500+ sources', data: { sources: 3 }, time: 100 },
        { agent: 'PriceAlert', action: 'Records price data for monitoring', data: { price: '1.0' }, time: 150 },
        { agent: 'x402 Protocol', action: 'Micropayment settled between agents', time: 200 },
        { agent: 'ServiceRegistry', action: 'Reputation scores updated on-chain', time: 250 },
      ],
      totalTime: 250,
      agentsInvolved: 3,
      apisUsed: ['Security V6', 'DEX Aggregator V6', 'Market Data V5'],
    },
  };
};

// Contract services endpoint
routes['GET /api/contract/services'] = async () => ({
  code: '0',
  data: Object.entries(SERVICE_CATALOG).map(([slug, svc]) => ({
    name: slug,
    endpoint: `/services/${slug}`,
    price: svc.price,
    currency: svc.currency,
    description: svc.description,
  })),
});

// x402 services endpoint
routes['GET /api/x402/services'] = async () => ({
  code: '0',
  data: Object.entries(SERVICE_CATALOG).map(([slug, svc]) => ({
    name: slug,
    endpoint: `/services/${slug}`,
    price: svc.price,
    currency: svc.currency,
    description: svc.description,
  })),
});

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data || data.trim() === '') return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

let server;
let baseUrl;

function fetch_(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = http.request(reqOpts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(JSON.parse(body)),
        });
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// --- Test suite ---

describe('API Integration Tests', () => {
  before(async () => {
    server = http.createServer(async (req, res) => {
      try {
        const qIdx = req.url.indexOf('?');
        const urlPath = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
        const method = req.method;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-402-Payment');

        if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        // Serve index.html for GET /
        if (urlPath === '/' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body><h1>Agent Nexus</h1></body></html>');
          return;
        }

        // API routes
        const routeKey = method + ' ' + urlPath;
        if (routes[routeKey]) {
          const query = qIdx === -1 ? {} : Object.fromEntries(new URLSearchParams(req.url.slice(qIdx + 1)));
          let body = {};
          if (method === 'POST') {
            try { body = await parseBody(req); }
            catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: '400', msg: e.message })); return; }
          }
          const result = await routes[routeKey](query, body, req.headers);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: '404', msg: 'Not Found' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  describe('GET / returns HTML', () => {
    it('responds with status 200', async () => {
      const res = await fetch_(`${baseUrl}/`);
      assert.equal(res.status, 200);
    });

    it('responds with text/html content type', async () => {
      const res = await fetch_(`${baseUrl}/`);
      assert.ok(res.headers['content-type'].includes('text/html'));
    });

    it('body contains HTML content', async () => {
      const res = await fetch_(`${baseUrl}/`);
      const body = await res.text();
      assert.ok(body.includes('<html>') || body.includes('<!DOCTYPE'));
    });
  });

  describe('POST /api/chat returns valid response', () => {
    it('returns code 0 with a valid message', async () => {
      const res = await fetch_(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'swap 100 USDT to ETH' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.code, '0');
    });

    it('returns data with intent, response, and steps', async () => {
      const res = await fetch_(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'help' }),
      });
      const data = await res.json();
      assert.ok(data.data);
      assert.ok('intent' in data.data);
      assert.ok('response' in data.data);
      assert.ok('steps' in data.data);
      assert.ok(Array.isArray(data.data.steps));
    });

    it('returns error for empty message', async () => {
      const res = await fetch_(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });
      const data = await res.json();
      assert.equal(data.code, 400);
      assert.ok(data.msg.includes('Missing'));
    });

    it('classifies swap intent correctly', async () => {
      const res = await fetch_(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'swap USDT for ETH' }),
      });
      const data = await res.json();
      assert.equal(data.data.intent, 'swap');
    });

    it('includes sessionId in response', async () => {
      const res = await fetch_(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });
      const data = await res.json();
      assert.ok(data.data.sessionId);
    });
  });

  describe('POST /api/demo/multi-agent returns expected structure', () => {
    it('returns code 0', async () => {
      const res = await fetch_(`${baseUrl}/api/demo/multi-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(data.code, '0');
    });

    it('returns timeline array with multiple agents', async () => {
      const res = await fetch_(`${baseUrl}/api/demo/multi-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.ok(Array.isArray(data.data.timeline));
      assert.ok(data.data.timeline.length >= 3);
    });

    it('includes agentsInvolved count', async () => {
      const res = await fetch_(`${baseUrl}/api/demo/multi-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(data.data.agentsInvolved, 3);
    });

    it('includes apisUsed array', async () => {
      const res = await fetch_(`${baseUrl}/api/demo/multi-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.ok(Array.isArray(data.data.apisUsed));
      assert.ok(data.data.apisUsed.length >= 2);
    });

    it('timeline entries have agent and action fields', async () => {
      const res = await fetch_(`${baseUrl}/api/demo/multi-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      for (const entry of data.data.timeline) {
        assert.ok('agent' in entry, 'Timeline entry missing agent field');
        assert.ok('action' in entry, 'Timeline entry missing action field');
      }
    });
  });

  describe('GET /api/contract/services returns array', () => {
    it('returns code 0', async () => {
      const res = await fetch_(`${baseUrl}/api/contract/services`);
      const data = await res.json();
      assert.equal(data.code, '0');
    });

    it('returns data as an array', async () => {
      const res = await fetch_(`${baseUrl}/api/contract/services`);
      const data = await res.json();
      assert.ok(Array.isArray(data.data));
    });

    it('each service has required fields', async () => {
      const res = await fetch_(`${baseUrl}/api/contract/services`);
      const data = await res.json();
      for (const svc of data.data) {
        assert.ok('name' in svc, 'Service missing name');
        assert.ok('price' in svc, 'Service missing price');
        assert.ok('currency' in svc, 'Service missing currency');
        assert.ok('description' in svc, 'Service missing description');
      }
    });

    it('returns at least 3 services', async () => {
      const res = await fetch_(`${baseUrl}/api/contract/services`);
      const data = await res.json();
      assert.ok(data.data.length >= 3);
    });
  });

  describe('Invalid routes return 404', () => {
    it('GET /api/nonexistent returns 404', async () => {
      const res = await fetch_(`${baseUrl}/api/nonexistent`);
      assert.equal(res.status, 404);
    });

    it('POST /api/nonexistent returns 404', async () => {
      const res = await fetch_(`${baseUrl}/api/nonexistent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 404);
    });

    it('404 response is JSON with code field', async () => {
      const res = await fetch_(`${baseUrl}/api/nonexistent`);
      const data = await res.json();
      assert.equal(data.code, '404');
    });

    it('GET /api/does/not/exist returns 404', async () => {
      const res = await fetch_(`${baseUrl}/api/does/not/exist`);
      assert.equal(res.status, 404);
    });
  });

  describe('CORS headers', () => {
    it('includes Access-Control-Allow-Origin', async () => {
      const res = await fetch_(`${baseUrl}/api/contract/services`);
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });
  });
});
