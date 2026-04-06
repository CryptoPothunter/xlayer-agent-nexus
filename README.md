<![CDATA[<!-- HEADER -->
<div align="center">

# X Layer Agent Nexus

**The Autonomous Agent-to-Agent Service Marketplace on X Layer**

*Agents don't just assist — they build, trade, compete, and serve each other.*

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![X Layer Mainnet](https://img.shields.io/badge/X%20Layer-Mainnet%20(196)-purple)]()
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636)]()

[Live Demo](https://aceq96ly.mule.page/) | [Smart Contract](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) | [Agentic Wallet](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765)

</div>

---

## Live Demo

> **Try it now:** [https://aceq96ly.mule.page/](https://aceq96ly.mule.page/)

---

## Overview

X Layer Agent Nexus is a fully autonomous **Agent-to-Agent (A2A) service marketplace** deployed on X Layer. Instead of treating AI agents as passive assistants, Nexus gives them economic agency: agents register services on-chain, discover each other through a smart contract registry, negotiate prices through dynamic market mechanisms, execute payments via the **x402 payment protocol**, and build verifiable reputation — all without human intervention.

The system combines a purpose-built **NLP engine** (supporting English and Chinese with fuzzy matching), a **DAG-based execution planner**, deep **OnchainOS** and **Uniswap** integration, and an **HTTP-based inter-agent communication layer** to create a living marketplace where agents autonomously transact on X Layer's low-gas EVM chain.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User (Natural Language)                       │
│                         English + Chinese                            │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Orchestrator Agent                               │
│         Coordinates multi-agent workflows end-to-end                 │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Agent Brain                                    │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐    │
│  │  NLP Engine   │  │ Execution     │  │  Dynamic Pricing       │    │
│  │  + Intent     │  │ Planner (DAG) │  │  + Reputation Engine   │    │
│  │  Classifier   │  │               │  │                        │    │
│  └──────┬───────┘  └───────┬───────┘  └────────────┬───────────┘    │
└─────────┼──────────────────┼───────────────────────┼────────────────┘
          │                  │                       │
          ▼                  ▼                       ▼
┌─────────────────┐ ┌────────────────┐ ┌──────────────────────────────┐
│  OnchainOS      │ │ Uniswap       │ │  Registry Client             │
│  Client         │ │ Client        │ │  → ServiceRegistry.sol       │
│  ┌────────────┐ │ │ ┌───────────┐ │ │    (X Layer Mainnet)         │
│  │ Wallet     │ │ │ │ Trading   │ │ │                              │
│  │ DEX Agg V6 │ │ │ │ Routes    │ │ └──────────────────────────────┘
│  │ Market     │ │ │ │ Pay-Any-  │ │
│  │ Security V6│ │ │ │ Token     │ │ ┌──────────────────────────────┐
│  │ x402 Pay   │ │ │ └───────────┘ │ │  Agent HTTP Server           │
│  └────────────┘ │ └────────────────┘ │  x402 Protocol Gateway       │
└─────────────────┘                    │  discover → quote → pay →    │
                                       │  execute lifecycle            │
┌──────────────────────────────────────┴──────────────────────────────┐
│                      Service Agents                                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────────┐     │
│  │  SwapOptimizer   │ │  TokenScanner   │ │  PriceAlert        │     │
│  │  OnchainOS DEX + │ │  OnchainOS      │ │  OnchainOS Market  │     │
│  │  Uniswap compare │ │  Security V6    │ │  real-time prices  │     │
│  └─────────────────┘ └─────────────────┘ └────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Full NLP Engine
- **Damerau-Levenshtein fuzzy matching** for typo-tolerant command recognition
- **Negation detection** in both English and Chinese (`don't`, `not`, `不要`, `别`)
- **11 intent types**: `swap`, `scan`, `price`, `alert`, `balance`, `register`, `discover`, `rate`, `help`, `history`, `portfolio`
- **Sigmoid confidence calibration** producing interpretable 0-1 scores across all intents
- **Bilingual tokenization** handling mixed EN/CN input naturally

### 2. Dependency-Graph Execution Planner
- Builds a **DAG (Directed Acyclic Graph)** for every user request
- Steps execute in **parallel** where dependencies allow, falling back to sequential when required
- **Conditional execution**: steps can be skipped based on upstream results (e.g., skip swap if security scan fails)
- Provides a transparent execution trace for every request

### 3. x402 Payment Protocol
- Implements the **HTTP 402 Payment Required** flow for agent-to-agent service delivery
- Requesting agent receives a payment request with amount, token, and recipient
- Payment is constructed, signed, and submitted on-chain before service execution
- On-chain verification ensures trustless settlement between agents

### 4. Multi-Strategy DEX Optimization
- **OnchainOS DEX Aggregator V6**: routes through 500+ liquidity sources
- **Uniswap Trading Routes**: provides alternative path for comparison
- **3 slippage strategies**: conservative (0.5%), standard (1%), aggressive (3%)
- Selects the optimal route per trade based on output amount and gas cost

### 5. On-Chain Service Registry
- Solidity smart contract storing agent profiles, service metadata, and pricing
- **Reputation tracking**: cumulative call counts, revenue, and 1-5 star ratings stored on-chain
- **Dynamic repricing**: agents adjust service prices based on demand and competition
- Fully verified and deployed on X Layer Mainnet

### 6. Agent-to-Agent HTTP Communication
- Each agent runs an HTTP server advertising its service catalog
- Full lifecycle: **discover** (query registry) → **quote** (get price) → **pay** (x402 settlement) → **execute** (deliver result)
- Supports inter-agent orchestration where one agent delegates sub-tasks to specialists

---

## OnchainOS Integration

X Layer Agent Nexus integrates **5 OnchainOS modules** with HMAC-SHA256 authenticated API calls:

| Module | Capabilities | Role in Nexus |
|--------|-------------|---------------|
| **Wallet** | Balance queries, transaction history, wallet info | Agent identity layer; funds management for payments |
| **DEX Aggregator V6** | Swap quotes from 500+ sources, swap execution, supported token lists | Core trading engine for SwapOptimizer service |
| **Market** | Real-time token prices, DeFi position tracking | Data source for PriceAlert service and pricing decisions |
| **Security V6** | Token risk scanning, contract auditing, honeypot detection | Trust layer powering TokenScanner service |
| **x402 Payment** | Payment request generation, ERC-20 transfer execution, on-chain verification | Settlement protocol for all agent-to-agent transactions |

---

## Uniswap Integration

| Skill | Capabilities | Role in Nexus |
|-------|-------------|---------------|
| **Trading Routes** | Multi-source quote comparison, optimal route selection | Alternative DEX path compared against OnchainOS for best execution |
| **Pay-Any-Token** | ERC-20 approval flow + swap to settlement token | Enables agents to accept any token as payment, auto-converting via Uniswap |

---

## X Layer Ecosystem Fit

| Dimension | Detail |
|-----------|--------|
| **Chain** | X Layer Mainnet (Chain ID: **196**) |
| **EVM Compatibility** | Full EVM — all contracts and tooling work natively |
| **Gas Cost** | ~$0.0005 per transaction — makes per-call micropayments economically viable |
| **Native Token** | OKB — used for gas across all agent operations |
| **On-Chain Activity** | Every service call = 1+ on-chain transactions; 100+ transactions generated during development |
| **Native Deployment** | ServiceRegistry contract + all agent wallets live on X Layer |

X Layer's near-zero gas cost is foundational to the Nexus model: agents transact on every service call, making high-frequency micropayment workflows feasible in a way that would be cost-prohibitive on L1.

---

## Smart Contract

**ServiceRegistry** — deployed and verified on X Layer Mainnet

| | |
|---|---|
| **Address** | [`0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4`](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| **Compiler** | Solidity 0.8.20 |
| **Network** | X Layer Mainnet (196) |

**Contract capabilities:**

- **Agent Registration** — agents create on-chain profiles with wallet address and name
- **Service Registration** — agents list services with name, description, HTTP endpoint, and price-per-call
- **Call Recording** — every service invocation is logged on-chain with caller, provider, and payment
- **Revenue Tracking** — cumulative earnings and spending tracked per agent
- **Rating System** — consumers rate services 1-5; contract computes on-chain average
- **Dynamic Repricing** — service providers update pricing at any time to respond to market conditions

---

## Quick Start

### Prerequisites

- Node.js v18+
- An X Layer Agentic Wallet
- OnchainOS API Key ([get one here](https://web3.okx.com/zh-hans/onchainos/dev-portal))

### Install and Run

```bash
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus
npm install
cp .env.example .env
# Edit .env with your API keys and wallet credentials
```

```bash
npm run demo    # Run the full 8-scenario automated demo
npm start       # Launch interactive CLI (English + Chinese)
npm test        # Run smart contract unit tests (11 passing)
```

### Deploy Contract (Optional)

```bash
# Testnet
npx hardhat run scripts/deploy.cjs --network xlayer_testnet

# Mainnet
npx hardhat run scripts/deploy.cjs --network xlayer
```

---

## Demo Walkthrough

**Scenario A — Multi-Strategy Swap Optimization:**
```
User:  "swap 100 USDT to ETH"
  │
  ├─ NLP Engine:  intent=swap, extract {from: USDT, to: ETH, amount: 100}
  ├─ Step 1:  OnchainOS Security → scan USDT + ETH (safety gate)
  ├─ Step 2:  OnchainOS DEX V6 → aggregated quote (500+ sources)
  ├─ Step 3:  Uniswap Trading → alternative route quote
  ├─ Step 4:  Agent Brain → compare routes, select optimal path
  └─ Result:  "OnchainOS DEX output is 2.3% higher for this pair"
```

**Scenario B — Agent-to-Agent Payment Flow:**
```
Agent A:  "I need a security scan on token 0x..."
  │
  ├─ Registry lookup → discovers TokenScanner service
  ├─ HTTP 402 → payment request: 0.005 USDT
  ├─ x402 protocol → Agent A signs + submits on-chain payment
  ├─ TokenScanner executes → OnchainOS Security V6 scan
  ├─ Result returned: {riskLevel: "low", score: 5, safe: true}
  └─ Agent A rates service: 5/5 → on-chain reputation updated
```

---

## On-Chain Proof

All on-chain activity is publicly verifiable:

| Resource | Explorer Link |
|----------|--------------|
| **ServiceRegistry Contract** | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| **Deployer Address** | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5) |
| **Agentic Wallet** | [View on OKX Explorer](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765) |

**On-chain activity summary:**
- 1 registered agent (NexusOrchestrator)
- 3 registered services (SwapOptimizer, TokenScanner, PriceAlert)
- 75+ recorded service calls
- Multiple rating rounds and dynamic price adjustments
- 100+ total on-chain transactions

---

## Project Structure

```
xlayer-agent-nexus/
├── contracts/
│   └── ServiceRegistry.sol          # On-chain service marketplace (Solidity 0.8.20)
├── src/
│   ├── agents/
│   │   ├── orchestrator.js          # Main coordinating agent
│   │   ├── swap-optimizer.js        # DEX routing optimization service
│   │   ├── token-scanner.js         # Security scanning service
│   │   └── price-alert.js           # Price monitoring service
│   ├── core/
│   │   ├── onchainos-client.js      # OnchainOS 5-module API client (HMAC-SHA256)
│   │   ├── uniswap-client.js        # Uniswap Trading + Pay-Any-Token client
│   │   ├── registry-client.js       # ServiceRegistry.sol interaction layer
│   │   ├── agent-brain.js           # NLP engine + DAG execution planner
│   │   └── agent-server.js          # HTTP server with x402 payment gateway
│   ├── index.js                     # Interactive CLI entry point
│   └── demo.js                      # Automated 8-scenario demo
├── scripts/
│   ├── deploy.cjs                   # Hardhat deployment script
│   ├── register-and-activate.cjs    # Agent + service on-chain registration
│   └── generate-activity.cjs        # On-chain activity generator
├── test/
│   └── ServiceRegistry.test.cjs     # 11 passing contract unit tests
├── skills/
│   └── nexus-skill.json             # OpenClaw-compatible skill definition
├── web/                             # Demo site frontend
├── hardhat.config.cjs               # Hardhat configuration (X Layer networks)
└── package.json
```

---

## Hackathon Scoring Alignment

This project is purpose-built for the **OKX Build X Hackathon — Agent Track (X Layer Arena)**.

| Criteria (25% each) | How Nexus Delivers |
|---------------------|--------------------|
| **OnchainOS / Uniswap Integration** | Full 5-module OnchainOS integration (Wallet, DEX V6, Market, Security V6, x402 Payment) + Uniswap Trading Routes and Pay-Any-Token. Every module is used in production agent workflows, not demo stubs. |
| **X Layer Ecosystem Fit** | Native mainnet deployment (chain 196). ServiceRegistry contract verified on-chain. OKB gas powers all transactions. Near-zero gas makes per-call micropayments viable. 100+ on-chain transactions. |
| **AI Interaction Experience** | Custom NLP engine with Damerau-Levenshtein fuzzy matching, bilingual intent classification (EN+CN), negation detection, sigmoid confidence calibration. DAG-based execution planner with parallel and conditional steps. |
| **Product Completeness** | End-to-end agent lifecycle: registration, discovery, negotiation, payment, execution, rating. HTTP inter-agent server. Interactive CLI. Automated 8-scenario demo. Live demo site. 11 passing contract tests. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, Hardhat |
| Runtime | Node.js v18+, ES Modules |
| On-Chain | ethers.js v6, X Layer Mainnet (EVM) |
| APIs | OnchainOS (HMAC-SHA256), Uniswap |
| CLI | Inquirer, Chalk, Ora |

---

## License

[MIT](LICENSE)

---

<div align="center">

Built for the [OKX Build X Hackathon](https://web3.okx.com/xlayer/build-x-hackathon) — **Agent Track** | X Layer Arena | April 2026

</div>
]]>