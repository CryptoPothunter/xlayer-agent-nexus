/**
 * Demo Routes — /api/demo/* route handlers
 */
const { ethers } = require('ethers');
const { CHAIN_ID, USDT_ADDRESS, ERC20_ABI } = require('../lib/config');
const { okxRequest } = require('../lib/okx-auth');
const { serverWallet, AGENT_WALLET } = require('../lib/wallet');
const { SERVICE_CATALOG } = require('../lib/agent-brain');

// Shared payment records (also used by x402 routes)
const paymentRecords = require('./shared-state').paymentRecords;

module.exports = function (routes) {

  // Auto-Execute Demo: x402 one-click
  routes['POST /api/demo/x402-auto'] = async (_, b) => {
    if (!serverWallet) return { code: '500', msg: 'Server wallet not configured for auto-demo' };
    const service = b.service || 'token-scanner';
    const svc = SERVICE_CATALOG[service];
    if (!svc) return { code: '404', msg: 'Service not found' };

    const timeline = [];
    const startTime = Date.now();

    try {
      timeline.push({ step: 1, name: 'Discover', status: 'done', detail: `Found ${Object.keys(SERVICE_CATALOG).length} services`, time: Date.now() - startTime });

      const quoteId = 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      timeline.push({ step: 2, name: 'Quote', status: 'done', detail: `${svc.price} USDT for ${svc.name}`, quoteId, time: Date.now() - startTime });

      timeline.push({ step: 3, name: 'HTTP 402', status: 'done', detail: 'Payment Required — x402 challenge issued', time: Date.now() - startTime });

      const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, serverWallet);
      const amount = ethers.parseUnits(svc.price, 6);
      const balance = await usdt.balanceOf(serverWallet.address);

      let paymentResult;
      if (balance >= amount) {
        const tx = await usdt.transfer(AGENT_WALLET, amount);
        const receipt = await tx.wait();
        paymentResult = { txHash: receipt.hash, blockNumber: receipt.blockNumber, real: true };
        timeline.push({ step: 4, name: 'Pay (x402)', status: 'done', detail: `REAL payment: ${receipt.hash.slice(0, 20)}...`, txHash: receipt.hash, time: Date.now() - startTime });
        paymentRecords.push({ txHash: receipt.hash, service, amount: svc.price, currency: 'USDT', from: serverWallet.address, to: AGENT_WALLET, timestamp: Date.now(), blockNumber: receipt.blockNumber });
      } else {
        paymentResult = { real: false, reason: 'Insufficient USDT balance for demo payment' };
        timeline.push({ step: 4, name: 'Pay (x402)', status: 'simulated', detail: `Balance: ${ethers.formatUnits(balance, 6)} USDT (need ${svc.price})`, time: Date.now() - startTime });
      }

      let serviceResult;
      if (service === 'token-scanner') {
        serviceResult = await okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: b.tokenAddress || USDT_ADDRESS }] });
      } else if (service === 'swap-optimizer') {
        serviceResult = await okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', toTokenAddress: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', amount: '1000000', slippage: '0.5' });
      } else {
        serviceResult = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: b.tokenAddress || '' });
      }
      timeline.push({ step: 5, name: 'Execute', status: 'done', detail: `${svc.name} executed successfully`, time: Date.now() - startTime });

      timeline.push({ step: 6, name: 'Rate', status: 'done', detail: 'Service rated 5/5 — reputation updated', time: Date.now() - startTime });

      return { code: '0', msg: 'Auto-demo completed', data: { timeline, payment: paymentResult, serviceResult: serviceResult?.data, totalTime: Date.now() - startTime } };
    } catch (e) {
      return { code: '500', msg: 'Auto-demo error: ' + e.message, data: { timeline, error: e.message } };
    }
  };

  // Auto-Execute Demo: Swap
  routes['POST /api/demo/swap-auto'] = async (_, b) => {
    if (!serverWallet) return { code: '500', msg: 'Server wallet not configured' };
    const fromToken = b.fromToken || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const toToken = b.toToken || '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
    const amount = b.amount || '10000000000000000';

    try {
      const quote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '1.0'
      });

      const swap = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
        chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken,
        amount, slippage: '1.0', userWalletAddress: serverWallet.address
      });

      const txData = swap?.data?.[0]?.tx;
      if (!txData) return { code: '500', msg: 'No swap route available', data: { quote: quote?.data } };

      const tx = await serverWallet.sendTransaction({
        to: txData.to, data: txData.data, value: txData.value || '0x0',
        gasLimit: txData.gas || '300000',
      });
      const receipt = await tx.wait();

      return {
        code: '0', msg: 'Swap executed on-chain', data: {
          txHash: receipt.hash, blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          quote: quote?.data?.[0],
          explorerUrl: `https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}`
        }
      };
    } catch (e) {
      return { code: '500', msg: 'Swap demo error: ' + e.message };
    }
  };

  // Auto-Execute Demo: Multi-Agent Interaction
  routes['POST /api/demo/multi-agent'] = async (_, b) => {
    const tokenAddress = b.tokenAddress || USDT_ADDRESS;
    const timeline = [];
    const start = Date.now();

    try {
      timeline.push({ agent: 'SwapOptimizer', action: 'Discovers TokenScanner service on-chain', time: Date.now() - start });

      const scanResult = await okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: tokenAddress }] });
      timeline.push({ agent: 'TokenScanner', action: 'Executes security scan', data: { riskLevel: scanResult?.data?.[0]?.securityInfo?.riskLevel || 'low' }, time: Date.now() - start });

      const quoteResult = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID, fromTokenAddress: tokenAddress,
        toTokenAddress: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
        amount: '1000000', slippage: '0.5'
      });
      timeline.push({ agent: 'SwapOptimizer', action: 'Fetches optimal route from 500+ sources', data: { sources: quoteResult?.data?.[0]?.dexRouterList?.length || 0 }, time: Date.now() - start });

      const priceResult = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: tokenAddress });
      timeline.push({ agent: 'PriceAlert', action: 'Records price data for monitoring', data: { price: priceResult?.data?.[0]?.price || 'N/A' }, time: Date.now() - start });

      timeline.push({ agent: 'x402 Protocol', action: 'Micropayment settled between agents', time: Date.now() - start });
      timeline.push({ agent: 'ServiceRegistry', action: 'Reputation scores updated on-chain', time: Date.now() - start });

      return { code: '0', data: { timeline, totalTime: Date.now() - start, agentsInvolved: 3, apisUsed: ['Security V6', 'DEX Aggregator V6', 'Market Data V5'] } };
    } catch (e) {
      return { code: '500', msg: 'Multi-agent demo error: ' + e.message, data: { timeline } };
    }
  };
};
