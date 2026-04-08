![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![X Layer](https://img.shields.io/badge/X%20Layer-Chain%20196-blue)
![OnchainOS](https://img.shields.io/badge/OnchainOS-5%20Modules-purple)
![Mainnet TX](https://img.shields.io/badge/Mainnet%20TX-160%2B-green)
![Tests](https://img.shields.io/badge/Tests-159%20Passing-brightgreen)

# X Layer Agent Nexus

**[Live Demo](https://bsd3k4p6.mule.page/)** | **[Smart Contract](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4)** | **[Agentic Wallet](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765)**

Agent Nexus is the first autonomous Agent-to-Agent service marketplace on X Layer (Chain 196). Unlike traditional AI agent systems where agents are passive tools invoked by users, Nexus treats agents as first-class economic entities that self-register services on-chain, discover each other through a smart contract registry, negotiate pricing, settle payments via the x402 protocol using real USDT transfers, and accumulate on-chain reputation scores. The platform integrates five OnchainOS modules with HMAC-SHA256 authentication, DEX Aggregator routing across 500+ liquidity sources on X Layer (iZUMi, SushiSwap, and other native DEX pools), and an NLP engine with LLM enhancement that supports bilingual (English/Chinese) natural-language commands to orchestrate multi-agent workflows with DAG-based parallel execution.

> **OKX Build X Hackathon** submission (14,000 USDT prize pool)

---

## Architecture

```
+-------------------------------------------------------------+
|                      Frontend (HTML/JS)                      |
|          Interactive Dashboard + OKX Wallet Connect          |
+----------------------------+--------------------------------+
                             |
                             v
+----------------------------+--------------------------------+
|                   Node.js Server (web/server.js)             |
|                                                              |
|  +------------------+  +-----------------+  +--------------+ |
|  | Agent Brain      |  | x402 Payment    |  | Rate Limiter | |
|  | NLP + LLM Engine |  | Gateway         |  | Session Mgmt | |
|  | Intent Classify  |  | quote/pay/      |  |              | |
|  | DAG Planner      |  | verify/execute  |  |              | |
|  +--------+---------+  +--------+--------+  +--------------+ |
|           |                     |                            |
+-----------|---------------------|----------------------------+
            |                     |
            v                     v
+---------------------+  +--------------------+
| OnchainOS APIs      |  | X Layer Mainnet    |
| (HMAC-SHA256 Auth)  |  | (Chain 196)        |
|                     |  |                    |
| - Wallet V5         |  | ServiceRegistry.sol|
| - DEX Aggregator V6 |  | - registerAgent()  |
| - Market V5         |  | - registerService()|
| - Security V6       |  | - recordCall()     |
| - x402 Payment      |  | - rateService()    |
+---------------------+  | - updatePrice()    |
                          +--------------------+
            |                     |
            v                     v
+---------------------+  +--------------------+
| DEX Intelligence    |  | Service Agents     |
| - Multi-Strategy    |  | - SwapOptimizer    |
|   Routing           |  | - TokenScanner     |
| - Pay-Any-Token     |  | - PriceAlert       |
+---------------------+  +--------------------+
```

**x402 Payment Flow:**
```
Agent A requests service --> HTTP 402 Payment Required --> Quote (amount + token + payee)
  --> Build ERC-20 USDT transfer calldata --> Wallet signs --> Broadcast on-chain
  --> Verify Transfer event on receipt --> Service executes --> On-chain rating
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Agent-to-Agent Marketplace** | Agents register services, discover each other, and transact autonomously on-chain through the ServiceRegistry smart contract. |
| **x402 Payment Protocol** | HTTP 402-based micropayment flow with real ERC-20 USDT transfers on X Layer. Full lifecycle: discover, quote, pay, execute, rate. |
| **NLP Agent Brain** | Intent classification across 11 categories with Damerau-Levenshtein fuzzy matching, bilingual negation detection (EN/ZH), and LLM-enhanced responses via Groq API. |
| **DAG Parallel Execution** | Builds a directed acyclic graph for each request. Independent steps (e.g., dual security scans) run in parallel; dependent steps (e.g., quote after scan) run sequentially. |
| **Multi-Strategy DEX Routing** | Queries 3 slippage strategies (0.5%, 1.0%, 3.0%) in parallel via OnchainOS DEX Aggregator (500+ sources) and selects the optimal path. |
| **Autonomous Arbitrage Execution** | The agent auto-executes real on-chain swaps when the detected spread exceeds a configurable threshold, capturing arbitrage opportunities without manual intervention. |
| **Differentiated Multi-Agent System** | 3 agents with distinct roles: AlphaTrader (arbitrage execution), DeFiGuardian (security + risk management), NexusOrchestrator (coordination + yield strategy). |
| **Smart Decision Engine** | Dynamic strategy selection based on real-time market conditions including volatility, spread size, and gas costs to maximize execution quality. |
| **Security Gate** | Automatic token security scan before every swap. Detects honeypots, unverified contracts, and owner-modifiable balances. Aborts on critical risk. |
| **On-Chain Reputation** | 1-5 star ratings stored on-chain. Cumulative call counts and revenue tracked per agent. Dynamic pricing based on demand and reputation. |
| **Pay-Any-Token** | DEX Aggregator routing allows agents to accept payment in any ERC-20 token, automatically swapping to USDT for settlement. |
| **Bilingual Support** | Full Chinese and English support for natural-language commands. Mixed input like "swap 100 USDT" works seamlessly. |
| **Multi-Turn Chat** | Session-based conversation with context resolution. Follow-up commands like "execute it" or "go ahead" inherit intent from prior turns. |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Smart Contract | Solidity 0.8.20, Hardhat | ServiceRegistry on X Layer mainnet |
| Backend | Node.js, native HTTP server | API proxy, HMAC signing, x402 gateway, AI chat |
| Frontend | Vanilla HTML/JS | Interactive dashboard, wallet connect, live demo |
| On-Chain Ops | ethers.js v6 | Wallet management, contract interaction, tx signing |
| NLP | Custom engine (rule-based + fuzzy) | Intent classification, entity extraction, negation detection |
| LLM | Groq API (Llama 3.3 70B) | Enhanced response generation with structured fallback |
| APIs | OnchainOS (5 modules), OnchainOS DEX Aggregator (500+ sources) | DEX aggregation, security scanning, market data, payments |
| Blockchain | X Layer (Chain 196, OKB gas) | EVM-compatible L2 with ultra-low gas (~$0.0005/tx) |
| Testing | Node.js built-in test runner (node:test) | Unit + integration tests (159 total) |

---

## Quick Start

### Prerequisites

- Node.js v18+
- OKX API credentials (API Key, Secret Key, Passphrase, Project ID)
- (Optional) Private key for server-side on-chain operations

### Setup

```bash
# Clone the repository
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your OKX API credentials and wallet private key
```

### Run

```bash
# Automated 8-scenario demo
npm run demo

# Interactive CLI (bilingual EN/ZH)
npm start

# Run all tests (Hardhat contract tests)
npm test

# Run Agent + API tests
node --test tests/

# Web application
cd web && npm install
export OKX_API_KEY=your_key
export OKX_SECRET_KEY=your_secret
export OKX_PASSPHRASE=your_passphrase
export OKX_PROJECT_ID=your_project_id
node server.js          # http://localhost:3000

# Deploy contract (optional)
npx hardhat run scripts/deploy.cjs --network xlayer
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OKX_API_KEY` | Yes | OKX API key for OnchainOS |
| `OKX_SECRET_KEY` | Yes | OKX secret key for HMAC-SHA256 signing |
| `OKX_PASSPHRASE` | Yes | OKX API passphrase |
| `OKX_PROJECT_ID` | Yes | OKX project identifier |
| `PRIVATE_KEY` | No | Wallet private key for server-side transactions |
| `GROQ_API_KEY` | No | Groq API key for LLM-enhanced responses |
| `PORT` | No | Server port (default: 3000) |
| `XLAYER_RPC` | No | Custom X Layer RPC URL (default: https://rpc.xlayer.tech) |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the interactive frontend dashboard |
| `GET` | `/health` | Health check endpoint |
| `GET` | `/api/dex/quote` | Get DEX aggregator quote (500+ sources) |
| `GET` | `/api/dex/swap` | Build swap transaction for wallet signing |
| `GET` | `/api/dex/tokens` | List all available tokens on X Layer |
| `POST` | `/api/security/scan` | Token security scan (honeypot, risk analysis) |
| `GET` | `/api/security/approval` | Check contract approval security |
| `GET` | `/api/market/price` | Real-time token price lookup |
| `GET` | `/api/market/search` | Search tokens by keyword or address |
| `GET` | `/api/wallet/balance` | Query wallet token balances |
| `GET` | `/api/wallet/history` | Transaction history for an address |
| `POST` | `/api/chat` | AI Agent Brain chat (NLP + LLM, multi-turn) |
| `GET` | `/api/x402/services` | List available x402-gated services |
| `POST` | `/api/x402/quote` | Request payment quote for a service |
| `POST` | `/api/x402/pay` | Execute server-side x402 USDT payment |
| `POST` | `/api/x402/verify` | Verify on-chain payment by tx hash |
| `POST` | `/api/x402/execute` | Execute service after x402 payment verification |
| `GET` | `/api/x402/history` | Payment history (last 50 records) |
| `POST` | `/api/x402/pay-any-token` | Pay for service with any ERC-20 token |
| `POST` | `/api/swap/execute` | Build real swap transaction for user wallet |
| `POST` | `/api/demo/x402-auto` | One-click x402 full lifecycle demo |
| `POST` | `/api/demo/swap-auto` | Auto-execute swap with server wallet |
| `POST` | `/api/demo/multi-agent` | Multi-agent interaction demo (3 agents) |
| `GET` | `/api/contract/services` | List registered contract services |

---

## Smart Contract Addresses

All contracts are deployed on **X Layer Mainnet (Chain 196)** with 160+ verified transactions.

| Contract | Address | Explorer |
|----------|---------|----------|
| **ServiceRegistry** | `0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4` | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| **Deployer** | `0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5` | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5) |
| **Agentic Wallet** | `0xb84023271ac8fd862c58cd5a6dd45558c3ba8765` | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765) |
| **USDT (X Layer)** | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x1E4a5963aBFD975d8c9021ce480b42188849D41d) |

### ServiceRegistry Contract Functions

| Function | Description |
|----------|-------------|
| `registerAgent(name)` | Register an agent with an on-chain identity |
| `registerService(name, description, endpoint, price)` | Publish a service to the marketplace |
| `recordServiceCall(serviceId, caller)` | Record a service invocation on-chain |
| `rateService(serviceId, score)` | Rate a service (1-5 stars) |
| `updateServicePrice(serviceId, newPrice)` | Dynamic price adjustment |

---

## Project Structure

```
xlayer-agent-nexus/
├── contracts/
│   └── ServiceRegistry.sol              On-chain service marketplace (Solidity 0.8.20)
├── src/
│   ├── agents/
│   │   ├── orchestrator.js              Main orchestration agent
│   │   ├── swap-optimizer.js            DEX route optimization service
│   │   ├── token-scanner.js             Security scanning service
│   │   └── price-alert.js               Price monitoring service
│   ├── core/
│   │   ├── onchainos-client.js          OnchainOS 5-module API (HMAC-SHA256)
│   │   ├── uniswap-client.js            DEX Aggregator routing + Pay-Any-Token
│   │   ├── registry-client.js           ServiceRegistry.sol interaction layer
│   │   ├── agent-brain.js               NLP engine + DAG execution planner
│   │   └── agent-server.js              HTTP server + x402 payment gateway
│   ├── index.js                         Interactive CLI entry point
│   └── demo.js                          8-scenario automated demo
├── scripts/
│   ├── deploy.cjs                       Hardhat deployment script
│   └── register-and-activate.cjs        Agent + service on-chain registration
├── test/
│   ├── ServiceRegistry.test.cjs         Contract unit tests (11 tests)
│   └── agents.test.cjs                  Agent unit tests (37 tests)
├── tests/
│   ├── agent-brain.test.cjs             Agent Brain NLP tests (59 tests)
│   ├── okx-auth.test.cjs               OKX auth + crypto tests (30 tests)
│   └── api.test.cjs                     API integration tests (22 tests)
├── skills/
│   └── nexus-skill.json                 OpenClaw-compatible skill definition
├── web/
│   ├── index.html                       Interactive demo site (wallet connect)
│   ├── server.js                        Production backend (API proxy + x402 + AI chat)
│   └── package.json
├── web-deploy/                          Deployment artifacts
├── hardhat.config.cjs                   Hardhat configuration (X Layer network)
├── package.json
└── README.md
```

---

## Screenshots

| Screen | Preview |
|--------|---------|
| Dashboard | ![Dashboard](docs/screenshots/dashboard.png) |
| Agent Brain Chat | ![Agent Brain](docs/screenshots/agent-brain.png) |
| x402 Payment Flow | ![x402 Flow](docs/screenshots/x402-flow.png) |
| Multi-Agent Demo | ![Multi-Agent](docs/screenshots/multi-agent.png) |
| DEX Swap Execution | ![Swap](docs/screenshots/swap-execution.png) |
| Security Scan Results | ![Security](docs/screenshots/security-scan.png) |

---

## Hackathon

This project was built for the **OKX Build X Hackathon** (14,000 USDT prize pool).

**Judging criteria alignment:**

| Criteria (25% each) | How Nexus delivers |
|----------------------|-------------------|
| **OnchainOS Integration** | Full 5-module OnchainOS integration with autonomous execution (Wallet + DEX Aggregator V6 + Market + Security V6 + x402). All authenticated with HMAC-SHA256 via server-side proxy. |
| **X Layer Ecosystem Fit** | Native mainnet deployment (Chain 196). On-chain ServiceRegistry. OKB-powered gas. Ultra-low gas enables micropayment economics. 160+ real mainnet transactions. |
| **AI Interaction Experience** | Custom NLP engine with Damerau-Levenshtein fuzzy matching and bilingual intent classification. LLM enhancement with structured fallback. DAG parallel execution. AI chat triggers real on-chain operations. |
| **Product Completeness** | End-to-end agent lifecycle: register, discover, negotiate, pay, execute, rate. Real swaps + real x402 USDT payments. AI chat + API console + HTTP agent server + CLI + automated demo + live site. 159 tests passing. |

---

## License

MIT
