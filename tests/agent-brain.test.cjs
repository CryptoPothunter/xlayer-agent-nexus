/**
 * Agent Brain Unit Tests
 * Tests for NLP intent classification, fuzzy matching, negation detection,
 * Chinese language support, DAG execution planning, and edge cases.
 *
 * Run: node --test tests/agent-brain.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// --- Extracted pure logic from server.js (monolith) for unit testing ---

// TOKEN_MAP: canonical token addresses on X Layer (Chain 196)
const TOKEN_MAP = {
  OKB: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  WETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  ETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  WOKB: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09',
  USDC: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10',
};

function resolveToken(sym) {
  return TOKEN_MAP[(sym || '').toUpperCase()] ?? sym;
}

// Intent classification (mirrors processAgentChat logic)
function classifyIntent(message) {
  const lower = message.toLowerCase();

  // Negation detection: check if the user is negating
  const negationPatterns = [
    /\b(don't|dont|do not|never|no|not|stop|cancel|refuse)\b/i,
    /(不要|不想|别|不|没有|取消|停止)/,
  ];
  const isNegated = negationPatterns.some((p) => p.test(message));

  let intent = 'general';
  let confidence = 0;

  if (/swap|exchange|trade|convert|兑换|交换/.test(lower)) {
    intent = 'swap';
    confidence = 0.9;
  } else if (/scan|security|safe|risk|honeypot|安全|风险|扫描/.test(lower)) {
    intent = 'security_scan';
    confidence = 0.85;
  } else if (/balance|portfolio|余额|资产/.test(lower)) {
    intent = 'check_balance';
    confidence = 0.85;
  } else if (/price|cost|value|worth|价格/.test(lower)) {
    intent = 'price_check';
    confidence = 0.8;
  } else if (/find|search|discover|service|查找|找/.test(lower)) {
    intent = 'find_service';
    confidence = 0.75;
  } else if (/earn|yield|stake|收益|赚/.test(lower)) {
    intent = 'earn';
    confidence = 0.7;
  } else if (/alert|notify|watch|提醒/.test(lower)) {
    intent = 'set_alert';
    confidence = 0.7;
  } else if (/register|注册/.test(lower)) {
    intent = 'register';
    confidence = 0.75;
  } else if (/help|帮助|怎么/.test(lower)) {
    intent = 'help';
    confidence = 0.6;
  }

  return { intent, confidence, negated: isNegated };
}

// Entity extraction (mirrors processAgentChat logic)
function extractEntities(message) {
  const entities = {};
  const tokenMatch = message.match(/\b(USDT|USDC|ETH|WETH|OKB|WOKB|BTC|WBTC)\b/gi);
  if (tokenMatch) entities.tokens = [...new Set(tokenMatch.map((t) => t.toUpperCase()))];
  const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
  if (amountMatch) entities.amount = amountMatch[1];
  const addrMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (addrMatch) entities.address = addrMatch[0];
  return entities;
}

// Damerau-Levenshtein distance for fuzzy matching
function damerauLevenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  const d = Array.from({ length: lenA + 1 }, () => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) d[i][0] = i;
  for (let j = 0; j <= lenB; j++) d[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[lenA][lenB];
}

// Fuzzy intent matching: find the closest keyword
function fuzzyMatchIntent(input, threshold = 2) {
  const intentKeywords = {
    swap: ['swap', 'exchange', 'trade', 'convert'],
    security_scan: ['scan', 'security', 'safe', 'risk', 'honeypot'],
    check_balance: ['balance', 'portfolio'],
    price_check: ['price', 'cost', 'value', 'worth'],
    help: ['help'],
    register: ['register'],
  };
  const words = input.toLowerCase().split(/\s+/);
  let bestIntent = 'general';
  let bestDist = Infinity;

  for (const word of words) {
    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      for (const kw of keywords) {
        const dist = damerauLevenshtein(word, kw);
        if (dist < bestDist && dist <= threshold) {
          bestDist = dist;
          bestIntent = intent;
        }
      }
    }
  }
  return { intent: bestIntent, distance: bestDist };
}

// DAG execution plan builder
function buildDAGPlan(intent, entities) {
  const steps = [];
  switch (intent) {
    case 'swap': {
      const fromSym = entities.tokens?.[0] || 'OKB';
      const toSym = entities.tokens?.[1] || 'USDT';
      // Parallel layer 1: security scans
      steps.push({
        layer: 1,
        parallel: true,
        tasks: [
          { action: 'security_scan', target: fromSym },
          { action: 'security_scan', target: toSym },
        ],
      });
      // Parallel layer 2: multi-strategy quotes
      steps.push({
        layer: 2,
        parallel: true,
        dependsOn: [1],
        tasks: [
          { action: 'dex_quote', strategy: 'conservative', slippage: '0.5' },
          { action: 'dex_quote', strategy: 'standard', slippage: '1.0' },
          { action: 'dex_quote', strategy: 'aggressive', slippage: '3.0' },
        ],
      });
      // Sequential layer 3: compare and execute
      steps.push({
        layer: 3,
        parallel: false,
        dependsOn: [2],
        tasks: [{ action: 'compare_routes_and_execute' }],
      });
      break;
    }
    case 'security_scan': {
      steps.push({
        layer: 1,
        parallel: true,
        tasks: [
          { action: 'token_scan', target: entities.address || entities.tokens?.[0] || 'USDT' },
          { action: 'contract_scan', target: entities.address || entities.tokens?.[0] || 'USDT' },
        ],
      });
      break;
    }
    case 'price_check': {
      steps.push({
        layer: 1,
        parallel: false,
        tasks: [{ action: 'get_price', target: entities.tokens?.[0] || 'OKB' }],
      });
      break;
    }
    default: {
      steps.push({ layer: 1, parallel: false, tasks: [{ action: intent }] });
    }
  }
  return { intent, steps, totalLayers: steps.length };
}

// PLACEHOLDER: further sections filled via Edit
// --- Tests begin ---

describe('Intent Classification', () => {
  it('classifies swap intent from English keywords', () => {
    for (const msg of ['swap 100 USDT to ETH', 'exchange OKB for USDT', 'trade BTC', 'convert WETH']) {
      const result = classifyIntent(msg);
      assert.equal(result.intent, 'swap', `Expected swap for "${msg}"`);
      assert.ok(result.confidence > 0.5);
    }
  });

  it('classifies security scan intent', () => {
    for (const msg of ['scan this token', 'security check', 'is this safe?', 'honeypot detection', 'risk analysis']) {
      const result = classifyIntent(msg);
      assert.equal(result.intent, 'security_scan', `Expected security_scan for "${msg}"`);
    }
  });

  it('classifies price check intent', () => {
    for (const msg of ['price of ETH', 'how much does OKB cost', 'WETH value', 'what is it worth']) {
      const result = classifyIntent(msg);
      assert.equal(result.intent, 'price_check', `Expected price_check for "${msg}"`);
    }
  });

  it('classifies balance intent', () => {
    for (const msg of ['check balance', 'show my portfolio', 'my balance please']) {
      const result = classifyIntent(msg);
      assert.equal(result.intent, 'check_balance', `Expected check_balance for "${msg}"`);
    }
  });

  it('classifies help intent', () => {
    const result = classifyIntent('help me');
    assert.equal(result.intent, 'help');
  });

  it('returns general for unrecognized input', () => {
    const result = classifyIntent('hello world');
    assert.equal(result.intent, 'general');
  });
});

describe('Fuzzy Matching', () => {
  it('matches misspelled "swpa" to swap', () => {
    const result = fuzzyMatchIntent('swpa 100 USDT');
    assert.equal(result.intent, 'swap');
    assert.ok(result.distance <= 2);
  });

  it('matches misspelled "balence" to check_balance', () => {
    const result = fuzzyMatchIntent('check balence');
    assert.equal(result.intent, 'check_balance');
  });

  it('matches misspelled "scna" to security_scan', () => {
    const result = fuzzyMatchIntent('scna token');
    assert.equal(result.intent, 'security_scan');
  });

  it('matches misspelled "pirce" to price_check', () => {
    const result = fuzzyMatchIntent('pirce of ETH');
    assert.equal(result.intent, 'price_check');
  });

  it('matches misspelled "hlep" to help', () => {
    const result = fuzzyMatchIntent('hlep me');
    assert.equal(result.intent, 'help');
  });

  it('returns general for completely unrelated input', () => {
    const result = fuzzyMatchIntent('xyzzy foobar');
    assert.equal(result.intent, 'general');
  });
});

describe('Negation Detection', () => {
  it('detects English negation with "don\'t"', () => {
    const result = classifyIntent("don't swap my tokens");
    assert.equal(result.negated, true);
    assert.equal(result.intent, 'swap');
  });

  it('detects English negation with "not"', () => {
    const result = classifyIntent('do not trade');
    assert.equal(result.negated, true);
  });

  it('detects English negation with "never"', () => {
    const result = classifyIntent('never exchange this');
    assert.equal(result.negated, true);
  });

  it('detects English negation with "cancel"', () => {
    const result = classifyIntent('cancel the swap');
    assert.equal(result.negated, true);
  });

  it('does not flag normal commands as negated', () => {
    const result = classifyIntent('swap 100 USDT to ETH');
    assert.equal(result.negated, false);
  });

  it('detects Chinese negation with 不要', () => {
    const result = classifyIntent('不要兑换');
    assert.equal(result.negated, true);
    assert.equal(result.intent, 'swap');
  });

  it('detects Chinese negation with 别', () => {
    const result = classifyIntent('别扫描');
    assert.equal(result.negated, true);
  });

  it('detects Chinese negation with 取消', () => {
    const result = classifyIntent('取消交换');
    assert.equal(result.negated, true);
  });
});

describe('Chinese Language Support', () => {
  it('classifies Chinese swap intent 兑换', () => {
    const result = classifyIntent('兑换100 USDT到ETH');
    assert.equal(result.intent, 'swap');
  });

  it('classifies Chinese swap intent 交换', () => {
    const result = classifyIntent('交换代币');
    assert.equal(result.intent, 'swap');
  });

  it('classifies Chinese security intent 安全', () => {
    const result = classifyIntent('安全检查');
    assert.equal(result.intent, 'security_scan');
  });

  it('classifies Chinese security intent 风险', () => {
    const result = classifyIntent('风险评估');
    assert.equal(result.intent, 'security_scan');
  });

  it('classifies Chinese security intent 扫描', () => {
    const result = classifyIntent('扫描代币');
    assert.equal(result.intent, 'security_scan');
  });

  it('classifies Chinese balance intent 余额', () => {
    const result = classifyIntent('查看余额');
    assert.equal(result.intent, 'check_balance');
  });

  it('classifies Chinese price intent 价格', () => {
    const result = classifyIntent('OKB价格');
    assert.equal(result.intent, 'price_check');
  });

  it('classifies Chinese help intent 帮助', () => {
    const result = classifyIntent('帮助');
    assert.equal(result.intent, 'help');
  });

  it('classifies mixed Chinese-English input', () => {
    const result = classifyIntent('帮我 swap 100 USDT');
    assert.equal(result.intent, 'swap');
  });

  it('extracts entities from mixed Chinese-English input', () => {
    const entities = extractEntities('兑换 50 USDT to ETH');
    assert.deepEqual(entities.tokens, ['USDT', 'ETH']);
    assert.equal(entities.amount, '50');
  });
});

describe('DAG Execution Planning', () => {
  it('builds a 3-layer DAG for swap intent', () => {
    const plan = buildDAGPlan('swap', { tokens: ['OKB', 'USDT'], amount: '100' });
    assert.equal(plan.totalLayers, 3);
    assert.equal(plan.steps[0].layer, 1);
    assert.equal(plan.steps[0].parallel, true);
    assert.equal(plan.steps[0].tasks.length, 2); // security scans in parallel
    assert.equal(plan.steps[1].layer, 2);
    assert.equal(plan.steps[1].parallel, true);
    assert.equal(plan.steps[1].tasks.length, 3); // 3 slippage strategies
    assert.deepEqual(plan.steps[1].dependsOn, [1]);
    assert.equal(plan.steps[2].layer, 3);
    assert.equal(plan.steps[2].parallel, false);
    assert.deepEqual(plan.steps[2].dependsOn, [2]);
  });

  it('builds a 1-layer DAG for security_scan', () => {
    const plan = buildDAGPlan('security_scan', { tokens: ['USDT'] });
    assert.equal(plan.totalLayers, 1);
    assert.equal(plan.steps[0].parallel, true);
    assert.equal(plan.steps[0].tasks.length, 2); // token_scan + contract_scan
  });

  it('builds a 1-layer DAG for price_check', () => {
    const plan = buildDAGPlan('price_check', { tokens: ['ETH'] });
    assert.equal(plan.totalLayers, 1);
    assert.equal(plan.steps[0].tasks[0].action, 'get_price');
    assert.equal(plan.steps[0].tasks[0].target, 'ETH');
  });

  it('builds a default DAG for unknown intent', () => {
    const plan = buildDAGPlan('general', {});
    assert.equal(plan.totalLayers, 1);
    assert.equal(plan.steps[0].tasks[0].action, 'general');
  });

  it('swap DAG uses correct default tokens when none provided', () => {
    const plan = buildDAGPlan('swap', {});
    assert.equal(plan.steps[0].tasks[0].target, 'OKB');
    assert.equal(plan.steps[0].tasks[1].target, 'USDT');
  });

  it('DAG layers have correct dependency chain', () => {
    const plan = buildDAGPlan('swap', { tokens: ['ETH', 'USDT'] });
    // Layer 1 has no dependencies
    assert.equal(plan.steps[0].dependsOn, undefined);
    // Layer 2 depends on layer 1
    assert.deepEqual(plan.steps[1].dependsOn, [1]);
    // Layer 3 depends on layer 2
    assert.deepEqual(plan.steps[2].dependsOn, [2]);
  });
});

describe('Entity Extraction', () => {
  it('extracts single token', () => {
    const entities = extractEntities('price of USDT');
    assert.deepEqual(entities.tokens, ['USDT']);
  });

  it('extracts multiple tokens', () => {
    const entities = extractEntities('swap USDT to ETH');
    assert.deepEqual(entities.tokens, ['USDT', 'ETH']);
  });

  it('extracts amount', () => {
    const entities = extractEntities('swap 100.5 USDT');
    assert.equal(entities.amount, '100.5');
  });

  it('extracts address', () => {
    const addr = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
    const entities = extractEntities(`scan ${addr}`);
    assert.equal(entities.address, addr);
  });

  it('deduplicates repeated tokens', () => {
    const entities = extractEntities('swap USDT USDT to ETH');
    assert.deepEqual(entities.tokens, ['USDT', 'ETH']);
  });

  it('returns empty object for no entities', () => {
    const entities = extractEntities('hello world');
    assert.deepEqual(entities, {});
  });
});

describe('Token Resolution', () => {
  it('resolves known token symbols', () => {
    assert.equal(resolveToken('USDT'), '0x1E4a5963aBFD975d8c9021ce480b42188849D41d');
    assert.equal(resolveToken('ETH'), '0x5A77f1443D16ee5761d310e38b62f77f726bC71c');
    assert.equal(resolveToken('OKB'), '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
  });

  it('is case-insensitive', () => {
    assert.equal(resolveToken('usdt'), resolveToken('USDT'));
    assert.equal(resolveToken('Eth'), resolveToken('ETH'));
  });

  it('returns raw input for unknown symbols', () => {
    assert.equal(resolveToken('UNKNOWN'), 'UNKNOWN');
    assert.equal(resolveToken('0xabc'), '0xabc');
  });

  it('handles null and undefined', () => {
    assert.equal(resolveToken(null), null);
    assert.equal(resolveToken(undefined), undefined);
  });
});

describe('Edge Cases', () => {
  it('handles empty input', () => {
    const result = classifyIntent('');
    assert.equal(result.intent, 'general');
    assert.equal(result.negated, false);
  });

  it('handles very long input (1000+ chars)', () => {
    const longInput = 'swap '.repeat(500) + 'USDT to ETH';
    const result = classifyIntent(longInput);
    assert.equal(result.intent, 'swap');
  });

  it('handles special characters', () => {
    const result = classifyIntent('swap $100 USDT → ETH!!!');
    assert.equal(result.intent, 'swap');
  });

  it('handles only whitespace', () => {
    const result = classifyIntent('   \t\n  ');
    assert.equal(result.intent, 'general');
  });

  it('handles emoji in input', () => {
    const result = classifyIntent('swap 🚀 USDT to ETH 💰');
    assert.equal(result.intent, 'swap');
  });

  it('handles numeric-only input', () => {
    const result = classifyIntent('12345');
    assert.equal(result.intent, 'general');
  });

  it('extracts entities from input with extra whitespace', () => {
    const entities = extractEntities('  swap   100   USDT   to   ETH  ');
    assert.deepEqual(entities.tokens, ['USDT', 'ETH']);
    assert.equal(entities.amount, '100');
  });

  it('fuzzy match handles empty string', () => {
    const result = fuzzyMatchIntent('');
    assert.equal(result.intent, 'general');
  });

  it('Damerau-Levenshtein returns 0 for identical strings', () => {
    assert.equal(damerauLevenshtein('swap', 'swap'), 0);
  });

  it('Damerau-Levenshtein detects transpositions', () => {
    // "swpa" is a transposition of "swap" — distance should be 1
    assert.equal(damerauLevenshtein('swpa', 'swap'), 1);
  });

  it('Damerau-Levenshtein detects insertions', () => {
    assert.equal(damerauLevenshtein('swa', 'swap'), 1);
  });

  it('Damerau-Levenshtein detects deletions', () => {
    assert.equal(damerauLevenshtein('swapp', 'swap'), 1);
  });

  it('Damerau-Levenshtein detects substitutions', () => {
    assert.equal(damerauLevenshtein('swab', 'swap'), 1);
  });
});
