/**
 * Configuration — all environment variable reads and constants
 */
const path = require('path');

// Load .env from parent directory and current directory
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const PORT = parseInt(process.env.PORT || '3000');
const HOST = '0.0.0.0';

// SECURITY: credentials from environment only — never hardcoded
const API_KEY = process.env.OKX_API_KEY;
const SECRET_KEY = process.env.OKX_SECRET_KEY;
const PASSPHRASE = process.env.OKX_PASSPHRASE;
const PROJECT_ID = process.env.OKX_PROJECT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CHAIN_ID = '196';
const BASE_URL = 'https://web3.okx.com';
const REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS || '0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4';
const USDT_ADDRESS = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';

if (!API_KEY || !SECRET_KEY) {
  console.error('[Server] FATAL: OKX_API_KEY and OKX_SECRET_KEY must be set in environment');
  process.exit(1);
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;

// ERC-20 ABI for USDT transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

// Registry ABI for on-chain recording
const REGISTRY_ABI = [
  'function recordServiceCall(bytes32 serviceId, address caller) external',
  'function rateService(bytes32 serviceId, uint8 score) external',
];

// Token address map
const TOKEN_MAP = {
  OKB: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  WETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  ETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  WOKB: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09',
  USDC: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10',
};

// Chat session settings
const CHAT_SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const CHAT_MAX_MESSAGES = 10;

// Rate limiting settings
const RATE_LIMIT = 60;
const RATE_WINDOW = 60000;

module.exports = {
  PORT, HOST,
  API_KEY, SECRET_KEY, PASSPHRASE, PROJECT_ID, PRIVATE_KEY,
  CHAIN_ID, BASE_URL, REGISTRY_ADDRESS, USDT_ADDRESS,
  GROQ_API_KEY,
  ERC20_ABI, REGISTRY_ABI, TOKEN_MAP,
  CHAT_SESSION_TTL, CHAT_MAX_MESSAGES,
  RATE_LIMIT, RATE_WINDOW,
};
