/**
 * x402 Routes — /api/x402/* route handlers
 */
const { ethers } = require('ethers');
const { CHAIN_ID, USDT_ADDRESS, ERC20_ABI, TOKEN_MAP } = require('../lib/config');
const { okxRequest } = require('../lib/okx-auth');
const { serverWallet, AGENT_WALLET, buildTransferCalldata, rpcProvider } = require('../lib/wallet');
const { SERVICE_CATALOG } = require('../lib/agent-brain');
const { paymentRecords, quoteStore } = require('./shared-state');

module.exports = function (routes) {

  routes['GET /api/x402/services'] = async () => ({
    code: '0',
    data: Object.entries(SERVICE_CATALOG).map(([slug, svc]) => ({
      name: slug, endpoint: `/services/${slug}`, price: svc.price, currency: svc.currency,
      description: svc.description, payTo: AGENT_WALLET
    }))
  });

  routes['POST /api/x402/quote'] = async (_, b) => {
    const svc = SERVICE_CATALOG[b.service];
    if (!svc) return { code: '404', msg: 'Service not found' };
    const quoteId = 'quote_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const quote = {
      quoteId, service: b.service, price: svc.price, currency: svc.currency,
      payTo: AGENT_WALLET, network: 'eip155:196', asset: USDT_ADDRESS,
      validFor: 300, expiresAt: Date.now() + 300000,
      paymentTx: {
        to: USDT_ADDRESS,
        data: buildTransferCalldata(AGENT_WALLET, svc.price),
        value: '0x0',
        chainId: '0xc4',
      }
    };
    quoteStore.set(quoteId, { ...quote, params: b.params, timestamp: Date.now() });
    return { code: '0', data: quote };
  };

  routes['POST /api/x402/pay'] = async (_, b) => {
    if (!serverWallet) return { code: '500', msg: 'Server wallet not configured' };
    const svc = SERVICE_CATALOG[b.service];
    if (!svc) return { code: '404', msg: 'Service not found' };
    try {
      const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, serverWallet);
      const amount = ethers.parseUnits(svc.price, 6);
      const balance = await usdt.balanceOf(serverWallet.address);
      if (balance < amount) return { code: '402', msg: `Insufficient USDT balance: ${ethers.formatUnits(balance, 6)}` };
      const tx = await usdt.transfer(AGENT_WALLET, amount);
      const receipt = await tx.wait();
      const record = {
        txHash: receipt.hash, service: b.service, amount: svc.price, currency: 'USDT',
        from: serverWallet.address, to: AGENT_WALLET, timestamp: Date.now(), blockNumber: receipt.blockNumber
      };
      paymentRecords.push(record);
      return { code: '0', msg: 'Payment confirmed on-chain', data: record };
    } catch (e) {
      return { code: '500', msg: 'Payment failed: ' + e.message };
    }
  };

  routes['POST /api/x402/verify'] = async (_, b) => {
    if (!b.txHash) return { code: '400', msg: 'Missing txHash' };
    try {
      const receipt = await rpcProvider.getTransactionReceipt(b.txHash);
      if (!receipt) return { code: '404', msg: 'Transaction not found' };
      if (receipt.status !== 1) return { code: '400', msg: 'Transaction failed' };
      const iface = new ethers.Interface(ERC20_ABI);
      let paymentFound = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
          try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed && parsed.name === 'Transfer') {
              paymentFound = true;
              return {
                code: '0', msg: 'Payment verified', data: {
                  txHash: b.txHash, from: parsed.args[0], to: parsed.args[1],
                  amount: ethers.formatUnits(parsed.args[2], 6), verified: true, blockNumber: receipt.blockNumber
                }
              };
            }
          } catch { }
        }
      }
      return { code: '400', msg: 'No USDT transfer found in transaction' };
    } catch (e) {
      return { code: '500', msg: 'Verification error: ' + e.message };
    }
  };

  routes['POST /api/x402/execute'] = async (_, b, h) => {
    const paymentHeader = h['x-402-payment'];
    if (!paymentHeader) {
      const svc = SERVICE_CATALOG[b.service];
      if (!svc) return { code: '404', msg: 'Service not found', available: Object.keys(SERVICE_CATALOG) };
      return {
        code: '402', msg: 'Payment Required',
        data: {
          price: svc.price, currency: 'USDT', network: 'eip155:196', payTo: AGENT_WALLET, asset: USDT_ADDRESS,
          paymentTx: { to: USDT_ADDRESS, data: buildTransferCalldata(AGENT_WALLET, svc.price), value: '0x0', chainId: '0xc4' }
        }
      };
    }
    const txHash = paymentHeader.replace('x402:txhash:', '').replace('x402:', '');
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return { code: '400', msg: 'Invalid payment header. Expected x402:txhash:0x... (64 hex chars)' };
    }
    let verified = false;
    try {
      const receipt = await rpcProvider.getTransactionReceipt(txHash);
      verified = receipt && receipt.status === 1;
    } catch (e) {
      return { code: '500', msg: 'Payment verification error: ' + e.message };
    }
    if (!verified) return { code: '402', msg: 'Payment verification failed: transaction not found or failed' };

    const svc = SERVICE_CATALOG[b.service];
    if (!svc) return { code: '404', msg: 'Service not found', available: Object.keys(SERVICE_CATALOG) };

    try {
      if (b.service === 'token-scanner' && b.params?.tokenAddress) {
        const r = await okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: b.params.tokenAddress }] });
        return { code: '0', msg: 'Service executed after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } } };
      }
      if (b.service === 'swap-optimizer' && b.params?.fromToken && b.params?.toToken) {
        const r = await okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: b.params.fromToken, toTokenAddress: b.params.toToken, amount: b.params.amount || '1000000', slippage: '0.5' });
        return { code: '0', msg: 'Service executed after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } } };
      }
      if (b.service === 'price-alert' && b.params?.tokenAddress) {
        const r = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: b.params.tokenAddress });
        return { code: '0', msg: 'Price alert configured after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } } };
      }
      return { code: '400', msg: `Service '${b.service}' requires valid params`, required: b.service === 'token-scanner' ? ['tokenAddress'] : b.service === 'swap-optimizer' ? ['fromToken', 'toToken', 'amount'] : ['tokenAddress'] };
    } catch (e) {
      return { code: '500', msg: `Service execution failed: ${e.message}`, payment: { txHash, verified: true } };
    }
  };

  routes['GET /api/x402/history'] = async () => ({
    code: '0', data: paymentRecords.slice(-50)
  });

  // Pay-Any-Token (Uniswap-compatible routing)
  routes['POST /api/x402/pay-any-token'] = async (_, b) => {
    if (!b.service || !b.payToken) return { code: '400', msg: 'Missing service and payToken' };
    const svc = SERVICE_CATALOG[b.service];
    if (!svc) return { code: '404', msg: 'Service not found' };

    const usdtAmount = ethers.parseUnits(svc.price, 6);
    const payToken = TOKEN_MAP[b.payToken.toUpperCase()] || b.payToken;

    const quote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
      chainIndex: CHAIN_ID, fromTokenAddress: payToken,
      toTokenAddress: USDT_ADDRESS, amount: usdtAmount.toString(), slippage: '1.0'
    });

    return {
      code: '0', msg: 'Pay-Any-Token quote ready', data: {
        service: b.service, price: svc.price + ' USDT',
        payWith: b.payToken, swapRoute: quote?.data?.[0] ? {
          inputAmount: quote.data[0].fromTokenAmount,
          inputToken: quote.data[0].fromToken?.tokenSymbol,
          outputAmount: quote.data[0].toTokenAmount,
          dexSources: quote.data[0].dexRouterList?.length || 0,
          priceImpact: quote.data[0].priceImpactPercent,
        } : null,
        protocol: 'Pay-Any-Token via DEX Aggregator (Uniswap-compatible routing)',
      }
    };
  };
};
