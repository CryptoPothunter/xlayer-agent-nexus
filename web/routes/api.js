/**
 * API Routes — /api/* route handlers (swap, security, market, balance, chat)
 */
const { CHAIN_ID, CHAT_MAX_MESSAGES } = require('../lib/config');
const { okxRequest } = require('../lib/okx-auth');
const { SERVICE_CATALOG, chatSessions, processAgentChat, getOrCreateSession } = require('../lib/agent-brain');

module.exports = function (routes) {

  routes['GET /api/dex/quote'] = async (q) => {
    if (!q.fromToken || !q.toToken || !q.amount) return { code: 400, msg: 'Missing params' };
    return okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: q.fromToken, toTokenAddress: q.toToken, amount: q.amount, slippage: q.slippage || '0.5' });
  };

  routes['GET /api/dex/swap'] = async (q) => {
    if (!q.fromToken || !q.toToken || !q.amount || !q.userWalletAddress) return { code: 400, msg: 'Missing params' };
    return okxRequest('GET', '/api/v6/dex/aggregator/swap', { chainIndex: CHAIN_ID, fromTokenAddress: q.fromToken, toTokenAddress: q.toToken, amount: q.amount, slippage: q.slippage || '0.5', userWalletAddress: q.userWalletAddress });
  };

  routes['GET /api/dex/tokens'] = async () => okxRequest('GET', '/api/v6/dex/aggregator/all-tokens', { chainIndex: CHAIN_ID });

  // Uniswap-Compatible DEX Quote
  routes['GET /api/uniswap/quote'] = async (q) => {
    if (!q.fromToken || !q.toToken || !q.amount) return { code: 400, msg: 'Missing params: fromToken, toToken, amount' };
    const fullQuote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
      chainIndex: CHAIN_ID, fromTokenAddress: q.fromToken, toTokenAddress: q.toToken,
      amount: q.amount, slippage: q.slippage || '0.5'
    });
    const quoteData = fullQuote?.data?.[0];
    if (!quoteData) return { code: '0', data: null, msg: 'No quote available' };
    const uniDexes = ['Uniswap V3', 'iZUMi', 'Uniswap V2'];
    const routerList = quoteData.dexRouterList || [];
    const uniRoutes = routerList.filter(r => uniDexes.includes(r?.dexProtocol?.dexName));
    const uniPercent = uniRoutes.reduce((s, r) => s + parseFloat(r?.dexProtocol?.percent || 0), 0);
    const noLiquidity = uniPercent === 0;
    const otherDexes = routerList.filter(r => !uniDexes.includes(r?.dexProtocol?.dexName)).map(r => r?.dexProtocol?.dexName).filter(Boolean);
    return {
      code: '0', data: {
        ...quoteData,
        uniswapRoutes: uniRoutes,
        uniswapPercent: uniPercent,
        totalDexes: routerList.length,
        noUniswapLiquidity: noLiquidity,
        otherDexes,
        explanation: noLiquidity
          ? 'Uniswap V3 has no liquidity on X Layer for this pair. The aggregator routes through ' + routerList.length + ' other DEX sources for optimal output.'
          : null
      }
    };
  };

  routes['POST /api/security/scan'] = async (_, b) => {
    if (!b.tokenAddress) return { code: 400, msg: 'Missing tokenAddress' };
    return okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: b.tokenAddress }] });
  };

  routes['GET /api/security/approval'] = async (q) => {
    if (!q.contractAddress) return { code: 400, msg: 'Missing contractAddress' };
    return okxRequest('GET', '/api/v6/dex/pre-transaction/approve-security', { chainIndex: CHAIN_ID, approveAddress: q.contractAddress });
  };

  routes['GET /api/market/price'] = async (q) => okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: q.tokenAddress || '' });

  routes['GET /api/market/search'] = async (q) => {
    if (!q.keyword) return { code: 400, msg: 'Missing keyword' };
    return okxRequest('GET', '/api/v5/wallet/token/search-by-address', { keyword: q.keyword, chainIndex: CHAIN_ID });
  };

  routes['GET /api/wallet/balance'] = async (q) => {
    if (!q.address) return { code: 400, msg: 'Missing address' };
    return okxRequest('POST', '/api/v5/wallet/asset/token-balances-by-address', {
      address: q.address, tokenAddresses: [
        { chainIndex: CHAIN_ID, tokenAddress: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d' },
        { chainIndex: CHAIN_ID, tokenAddress: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c' },
        { chainIndex: CHAIN_ID, tokenAddress: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09' },
        { chainIndex: CHAIN_ID, tokenAddress: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10' },
      ]
    });
  };

  routes['GET /api/wallet/history'] = async (q) => {
    if (!q.address) return { code: 400, msg: 'Missing address' };
    return okxRequest('GET', '/api/v5/wallet/post-transaction/transactions-by-address', { address: q.address, chains: CHAIN_ID, limit: q.limit || '20' });
  };

  // Swap execution
  routes['POST /api/swap/execute'] = async (_, b) => {
    if (!b.fromToken || !b.toToken || !b.amount || !b.userWalletAddress) {
      return { code: 400, msg: 'Missing: fromToken, toToken, amount, userWalletAddress' };
    }
    try {
      const swapData = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
        chainIndex: CHAIN_ID, fromTokenAddress: b.fromToken, toTokenAddress: b.toToken,
        amount: b.amount, slippage: b.slippage || '0.5', userWalletAddress: b.userWalletAddress
      });
      return { code: '0', data: swapData?.data };
    } catch (e) {
      return { code: '500', msg: 'Swap build failed: ' + e.message };
    }
  };

  // AI Chat
  routes['POST /api/chat'] = async (_, b) => {
    const message = b.message || b.input || '';
    if (!message) return { code: 400, msg: 'Missing message' };

    let sessionId = b.sessionId || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const session = getOrCreateSession(sessionId);

    const clientHistory = Array.isArray(b.history) ? b.history.slice(-CHAT_MAX_MESSAGES) : [];

    session.messages.push({ role: 'user', content: message, timestamp: Date.now() });
    if (session.messages.length > CHAT_MAX_MESSAGES) {
      session.messages = session.messages.slice(-CHAT_MAX_MESSAGES);
    }

    const conversationHistory = session.messages.length > 1 ? session.messages.slice(-CHAT_MAX_MESSAGES) : clientHistory;

    const result = await processAgentChat(message, b.context || {}, conversationHistory);

    const agentResponse = result?.data?.response || '';
    session.messages.push({ role: 'agent', content: agentResponse, timestamp: Date.now() });
    if (session.messages.length > CHAT_MAX_MESSAGES) {
      session.messages = session.messages.slice(-CHAT_MAX_MESSAGES);
    }

    const history = session.messages.slice(-5);
    if (result && result.data) {
      result.data.sessionId = sessionId;
      result.data.history = history;
    }
    return result;
  };
};
