/**
 * Autonomous Routes — /api/autonomous/* route handlers
 * Controls and monitors the autonomous agent loop and multi-agent collaboration.
 */
const autonomous = require('../lib/autonomous-loop');
const multiAgent = require('../lib/multi-agent');
const { serverWallet, rpcProvider, AGENT_WALLET } = require('../lib/wallet');
const { ethers } = require('ethers');
const { USDT_ADDRESS, ERC20_ABI, REGISTRY_ADDRESS, REGISTRY_ABI } = require('../lib/config');
const { paymentRecords } = require('./shared-state');

module.exports = function (routes) {

  // ═══ Autonomous Loop Control ═══

  routes['GET /api/autonomous/status'] = async () => ({
    code: '0',
    data: autonomous.getStatus(),
  });

  routes['POST /api/autonomous/start'] = async () => {
    const result = autonomous.start();
    return { code: '0', data: result };
  };

  routes['POST /api/autonomous/stop'] = async () => {
    const result = autonomous.stop();
    return { code: '0', data: result };
  };

  routes['GET /api/autonomous/log'] = async (q) => {
    const limit = parseInt(q.limit || '50');
    return { code: '0', data: autonomous.getLog(limit) };
  };

  routes['GET /api/autonomous/cycles'] = async (q) => {
    const limit = parseInt(q.limit || '20');
    return { code: '0', data: autonomous.getCycleHistory(limit) };
  };

  routes['GET /api/autonomous/latest'] = async () => ({
    code: '0',
    data: autonomous.getLatestCycle(),
  });

  // Manual trigger
  routes['POST /api/autonomous/trigger'] = async () => {
    try {
      const result = await autonomous.runCycle();
      return { code: '0', msg: 'Manual cycle completed', data: result };
    } catch (e) {
      return { code: '500', msg: 'Cycle error: ' + e.message };
    }
  };

  // ═══ Cumulative Stats & Analytics ═══

  routes['GET /api/autonomous/stats'] = async () => ({
    code: '0',
    data: autonomous.getCumulativeStats(),
  });

  routes['GET /api/autonomous/earnings-timeline'] = async () => ({
    code: '0',
    data: autonomous.getEarningsTimeline(),
  });

  routes['GET /api/autonomous/strategy'] = async (q) => {
    const limit = parseInt(q.limit || '20');
    return { code: '0', data: autonomous.getStrategyDecisions(limit) };
  };

  routes['GET /api/autonomous/arbitrage'] = async (q) => {
    const limit = parseInt(q.limit || '20');
    return { code: '0', data: autonomous.getArbitrageHistory(limit) };
  };

  // ═══ Multi-Agent Collaboration ═══

  routes['POST /api/multi-agent/init'] = async () => {
    try {
      const result = await multiAgent.initialize();
      return { code: '0', data: result };
    } catch (e) {
      return { code: '500', msg: 'Init error: ' + e.message };
    }
  };

  routes['POST /api/multi-agent/fund'] = async () => {
    try {
      const result = await multiAgent.fundSubWallets();
      return { code: '0', data: result };
    } catch (e) {
      return { code: '500', msg: 'Funding error: ' + e.message };
    }
  };

  routes['POST /api/multi-agent/collaborate'] = async () => {
    try {
      const result = await multiAgent.runCollaboration();
      return { code: '0', msg: 'Collaboration cycle completed', data: result };
    } catch (e) {
      return { code: '500', msg: 'Collaboration error: ' + e.message };
    }
  };

  routes['GET /api/multi-agent/agents'] = async () => ({
    code: '0',
    data: multiAgent.getAgents(),
  });

  routes['GET /api/multi-agent/log'] = async (q) => {
    const limit = parseInt(q.limit || '50');
    return { code: '0', data: multiAgent.getCollabLog(limit) };
  };

  routes['GET /api/multi-agent/history'] = async (q) => {
    const limit = parseInt(q.limit || '20');
    return { code: '0', data: multiAgent.getCollabHistory(limit) };
  };

  routes['GET /api/multi-agent/latest'] = async () => ({
    code: '0',
    data: multiAgent.getLatestCollab(),
  });

  // ═══ Real Swap Execution ═══

  routes['POST /api/swap/real-execute'] = async (_, b) => {
    if (!serverWallet) return { code: '500', msg: 'Server wallet not configured' };

    const fromToken = b.fromToken || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const toToken = b.toToken || '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
    const amount = b.amount || '10000000000000000'; // 0.01 OKB default
    const slippage = b.slippage || '1.0';
    const timeline = [];
    const start = Date.now();

    try {
      // Step 1: Security scan
      timeline.push({ step: 1, name: 'Security Check', status: 'running', time: Date.now() - start });
      const scanRes = await require('../lib/okx-auth').okxRequest('POST', '/api/v6/security/token-scan', {
        source: 'api', tokenList: [{ chainId: '196', contractAddress: toToken }]
      });
      const riskLevel = scanRes?.data?.[0]?.securityInfo?.riskLevel || 'unknown';
      timeline[0].status = 'done';
      timeline[0].detail = `Risk: ${riskLevel}`;

      // Step 2: Get quote
      timeline.push({ step: 2, name: 'DEX Quote', status: 'running', time: Date.now() - start });
      const quoteRes = await require('../lib/okx-auth').okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: '196', fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage,
      });
      const quoteData = quoteRes?.data?.[0];
      timeline[1].status = 'done';
      timeline[1].detail = quoteData ? `Output: ${quoteData.toTokenAmount}` : 'No route';

      if (!quoteData) return { code: '500', msg: 'No swap route available', data: { timeline } };

      // Step 3: Get swap transaction data
      timeline.push({ step: 3, name: 'Build Transaction', status: 'running', time: Date.now() - start });
      const swapRes = await require('../lib/okx-auth').okxRequest('GET', '/api/v6/dex/aggregator/swap', {
        chainIndex: '196', fromTokenAddress: fromToken, toTokenAddress: toToken,
        amount, slippage, userWalletAddress: serverWallet.address,
      });
      const txData = swapRes?.data?.[0]?.tx;
      if (!txData) return { code: '500', msg: 'Failed to build swap transaction', data: { timeline, quote: quoteData } };
      timeline[2].status = 'done';
      timeline[2].detail = `To: ${txData.to?.slice(0, 10)}...`;

      // Step 4: Execute on-chain
      timeline.push({ step: 4, name: 'Execute On-Chain', status: 'running', time: Date.now() - start });
      const tx = await serverWallet.sendTransaction({
        to: txData.to,
        data: txData.data,
        value: txData.value || '0x0',
        gasLimit: txData.gas || '300000',
      });
      const receipt = await tx.wait();
      timeline[3].status = 'done';
      timeline[3].detail = `Block: ${receipt.blockNumber}`;

      // Step 5: Record service call on-chain
      timeline.push({ step: 5, name: 'Record On-Chain', status: 'running', time: Date.now() - start });
      try {
        const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, serverWallet);
        const svcId = '0x76cb3997d766569bb6712849bc22d6ba842449dc9105f87cd1291f38a10a48cd';
        const recordTx = await registry.recordServiceCall(svcId, serverWallet.address);
        await recordTx.wait();
        timeline[4].status = 'done';
        timeline[4].detail = 'SwapOptimizer call recorded';
      } catch (e) {
        timeline[4].status = 'skipped';
        timeline[4].detail = e.message?.slice(0, 60);
      }

      // Record in payment history
      paymentRecords.push({
        txHash: receipt.hash,
        service: 'real-swap',
        type: 'swap',
        from: serverWallet.address,
        to: txData.to,
        fromToken: quoteData.fromToken?.tokenSymbol || 'Unknown',
        toToken: quoteData.toToken?.tokenSymbol || 'Unknown',
        fromAmount: quoteData.fromTokenAmount,
        toAmount: quoteData.toTokenAmount,
        timestamp: Date.now(),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}`,
      });

      return {
        code: '0',
        msg: 'Real swap executed on-chain',
        data: {
          timeline,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          fromToken: quoteData.fromToken?.tokenSymbol,
          toToken: quoteData.toToken?.tokenSymbol,
          fromAmount: quoteData.fromTokenAmount,
          toAmount: quoteData.toTokenAmount,
          dexSources: quoteData.dexRouterList?.length || 0,
          priceImpact: quoteData.priceImpactPercent,
          securityCheck: riskLevel,
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}`,
          totalTime: Date.now() - start,
        }
      };
    } catch (e) {
      return { code: '500', msg: 'Swap execution error: ' + e.message, data: { timeline } };
    }
  };

  // ═══ Enhanced Transaction History ═══

  routes['GET /api/transactions/all'] = async () => {
    // Combine all sources of transactions
    const allTxs = [];

    // From payment records
    for (const pr of paymentRecords) {
      allTxs.push({
        type: pr.type || 'x402-payment',
        service: pr.service,
        txHash: pr.txHash,
        from: pr.from,
        to: pr.to,
        amount: pr.amount,
        fromToken: pr.fromToken,
        toToken: pr.toToken,
        timestamp: pr.timestamp,
        blockNumber: pr.blockNumber,
        explorerUrl: pr.explorerUrl || `https://www.okx.com/web3/explorer/xlayer/tx/${pr.txHash}`,
      });
    }

    // From autonomous loop
    const latestCycle = autonomous.getLatestCycle();
    if (latestCycle?.serviceCallsTx) {
      for (const tx of latestCycle.serviceCallsTx) {
        allTxs.push({
          type: 'autonomous-service-call',
          service: tx.service,
          txHash: tx.txHash,
          blockNumber: tx.blockNumber,
          gasUsed: tx.gasUsed,
          timestamp: tx.timestamp,
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${tx.txHash}`,
        });
      }
    }

    // From collaboration
    const latestCollab = multiAgent.getLatestCollab();
    if (latestCollab) {
      for (const ix of latestCollab.interactions.filter(i => i.txHash)) {
        allTxs.push({
          type: 'multi-agent-call',
          service: ix.service,
          caller: ix.caller,
          provider: ix.provider,
          txHash: ix.txHash,
          blockNumber: ix.blockNumber,
          timestamp: latestCollab.startedAt,
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${ix.txHash}`,
        });
      }
      for (const pay of latestCollab.payments) {
        allTxs.push({
          type: 'multi-agent-payment',
          from: pay.from,
          to: pay.to,
          amount: pay.amount,
          txHash: pay.txHash,
          blockNumber: pay.blockNumber,
          reason: pay.reason,
          timestamp: latestCollab.startedAt,
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${pay.txHash}`,
        });
      }
      for (const rt of latestCollab.ratings) {
        allTxs.push({
          type: 'multi-agent-rating',
          rater: rt.rater,
          service: rt.service,
          score: rt.score,
          txHash: rt.txHash,
          blockNumber: rt.blockNumber,
          timestamp: latestCollab.startedAt,
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${rt.txHash}`,
        });
      }
    }

    // Sort by timestamp descending
    allTxs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return { code: '0', data: allTxs.slice(0, 100) };
  };
};
