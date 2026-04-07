/**
 * Wallet — Ethers.js setup, serverWallet, provider, contract helpers
 */
const { ethers } = require('ethers');
const { PRIVATE_KEY, ERC20_ABI, USDT_ADDRESS } = require('./config');

const rpcProvider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC || 'https://rpc.xlayer.tech');

let serverWallet = null;
if (PRIVATE_KEY && PRIVATE_KEY.length >= 64) {
  try {
    serverWallet = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
    console.log(`[Server] Wallet loaded: ${serverWallet.address}`);
  } catch (e) {
    console.warn(`[Server] Invalid private key, server-side signing disabled`);
  }
} else {
  console.log('[Server] No valid private key — use wallet connection for on-chain operations');
}

const AGENT_WALLET = serverWallet ? serverWallet.address : '0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5';

function buildTransferCalldata(to, amount) {
  const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6));
  const selector = 'a9059cbb';
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = amountRaw.toString(16).padStart(64, '0');
  return '0x' + selector + paddedTo + paddedAmount;
}

function getUsdtContract(signer) {
  return new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer || serverWallet);
}

module.exports = {
  ethers,
  rpcProvider,
  serverWallet,
  AGENT_WALLET,
  buildTransferCalldata,
  getUsdtContract,
};
