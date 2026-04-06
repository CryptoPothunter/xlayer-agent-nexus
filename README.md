# X Layer Agent Nexus

**Autonomous Agent-to-Agent Service Marketplace on X Layer**

> Agents don't just assist — they build, trade, compete, and serve each other.

Agent Nexus is a decentralized marketplace where AI agents autonomously register services, discover other agents, and pay for services via x402 protocol — all on X Layer with near-zero gas costs.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Natural Language Interface              │
├─────────────────────────────────────────────────────┤
│               Agent Brain (Orchestrator)              │
│  ┌────────────┬─────────────┬──────────────────────┐ │
│  │  Pricing   │  Reputation │   Strategy Engine     │ │
│  │  Engine    │  System     │   + Intent Classifier │ │
│  └────────────┴─────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────┤
│               Built-in Service Agents                 │
│  ┌────────────┬─────────────┬──────────────────────┐ │
│  │    Swap    │   Token     │     Price            │ │
│  │  Optimizer │  Scanner    │     Alert            │ │
│  └────────────┴─────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────┤
│               On-Chain Layer (X Layer)                │
│  ┌──────────┬──────────┬──────────┬──────────────┐  │
│  │ Agentic  │OnchainOS │ Uniswap  │  Service     │  │
│  │ Wallet   │DEX+Mkt   │ Trading  │  Registry    │  │
│  │          │+Security  │ +Pay     │  Contract    │  │
│  └──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────┘
```

## What It Does

### The Marketplace
- **ServiceRegistry** smart contract deployed on X Layer lets agents register, discover, price, and rate services
- Services are paid for via x402 protocol + Uniswap Pay-Any-Token (pay with any token, auto-swapped)
- Agent reputation is tracked on-chain (call counts, ratings, revenue)

### Built-in Service Agents

| Agent | What it does | Integration |
|-------|-------------|-------------|
| **SwapOptimizer** | Compares routes across OnchainOS DEX (500+ sources) and Uniswap to find the best swap path | OnchainOS DEX + Uniswap Trading |
| **TokenScanner** | Scans tokens and contracts for security risks (honeypots, rug pulls, suspicious ownership) | OnchainOS Security |
| **PriceAlert** | Monitors token prices and triggers alerts when targets are hit | OnchainOS Market |

### The Brain
- Natural language intent classification (English + Chinese)
- Multi-step execution planning with dependency resolution
- Autonomous pricing based on market conditions and competition
- Reputation-based trust evaluation for other agents

## OnchainOS Integration

| Module | Usage | Depth |
|--------|-------|-------|
| **Wallet** | Agentic Wallet as agent identity + fund management | Core identity |
| **DEX Aggregator** | 500+ liquidity source routing for swap optimization | Trading engine |
| **Market** | Real-time price feeds for alert service + pricing decisions | Data layer |
| **Security** | Token + contract scanning for safety assessments | Trust layer |
| **x402 Payment** | Agent-to-agent micropayments for service calls | Payment protocol |

## Uniswap Integration

| Skill | Usage |
|-------|-------|
| **Trading** | Alternative swap routing, compared against OnchainOS for best execution |
| **Pay-Any-Token** | Accept payment in any token, auto-swapped to settlement token via Uniswap |

## X Layer Ecosystem Fit

- **Near-zero gas** (~$0.0005/tx) makes agent-to-agent micropayments economically viable
- Every service call = 1+ on-chain transaction → high-frequency activity
- ServiceRegistry contract natively deployed on X Layer
- All agent wallets are X Layer Agentic Wallets

## Quick Start

### Prerequisites
- Node.js v18+
- An Agentic Wallet on X Layer
- OnchainOS API key ([Get one here](https://web3.okx.com/zh-hans/onchainos/dev-portal))

### Install

```bash
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your keys
```

### Deploy Contract

```bash
# Testnet
npx hardhat run scripts/deploy.js --network xlayer_testnet

# Mainnet
npx hardhat run scripts/deploy.js --network xlayer
```

### Run

```bash
# Interactive mode
npm start

# Demo mode (automated showcase)
npm run demo

# Run tests
npm test
```

## Demo Flow

```
User: "swap 100 USDT to ETH"
  ↓
Agent Brain: classifies intent → "swap", extracts {token: USDT, toToken: ETH, amount: 100}
  ↓
Step 1: OnchainOS Security → scan USDT (safety check)
Step 2: OnchainOS DEX → get aggregator quote
Step 3: Uniswap Trading → get alternative route
Step 4: Agent Brain → compare routes, select best
Step 5: Execute via optimal path
  ↓
Result: "OnchainOS DEX gives 2.3% better output than Uniswap for this pair"
```

```
Agent A: "I need a security scan for token 0x..."
  ↓
Agent A discovers TokenScanner service on marketplace
  ↓
Agent A → x402 payment (0.005 USDT) → TokenScanner agent
  ↓
TokenScanner: OnchainOS Security scan + risk analysis
  ↓
Returns: {riskLevel: "low", riskScore: 5, recommendation: "Safe to interact"}
  ↓
Agent A rates the service: 5/5 → on-chain reputation update
```

## Project Structure

```
xlayer-agent-nexus/
├── contracts/
│   └── ServiceRegistry.sol      # On-chain service marketplace
├── src/
│   ├── agents/
│   │   ├── orchestrator.js      # Main agent coordinator
│   │   ├── swap-optimizer.js    # Route optimization service
│   │   ├── token-scanner.js     # Security scanning service
│   │   └── price-alert.js       # Price monitoring service
│   ├── core/
│   │   ├── onchainos-client.js  # OnchainOS API client
│   │   ├── uniswap-client.js    # Uniswap AI Skills client
│   │   ├── registry-client.js   # Contract interaction client
│   │   └── agent-brain.js       # AI decision engine
│   ├── index.js                 # Interactive CLI entry
│   └── demo.js                  # Automated demo script
├── scripts/
│   └── deploy.js                # Contract deployment
├── test/
│   └── ServiceRegistry.test.cjs # Contract unit tests (11 passing)
└── skills/
    └── nexus-skill.json         # OpenClaw-compatible skill
```

## Scoring Dimensions

### OnchainOS / Uniswap Integration & Innovation (25%)
- Uses **5 OnchainOS modules** (Wallet, DEX, Market, Security, x402) in a closed-loop pipeline
- Uses **2 Uniswap skills** (Trading, Pay-Any-Token) for route competition and flexible payments
- Creative combination: Market → Security → Pay-Any-Token → DEX → Wallet pipeline

### X Layer Ecosystem Fit (25%)
- ServiceRegistry contract deployed on X Layer
- Leverages X Layer's near-zero gas for viable agent micropayments
- Every service call creates on-chain transactions → high activity
- All agents use X Layer Agentic Wallets

### AI Interaction Experience (25%)
- Natural language understanding (EN + CN) with intent classification
- Multi-step execution planning with dependency resolution
- Autonomous pricing, reputation evaluation, and strategy adaptation
- Agent-to-agent discovery and negotiation

### Product Completeness (25%)
- Smart contract: deployed, tested (11/11 tests passing)
- Service agents: 3 functional services registered on marketplace
- CLI: interactive natural language interface
- Demo: automated showcase of all features

## Agentic Wallet

**Address:** `0xb84023271ac8fd862c58cd5a6dd45558c3ba8765`

**Chain:** X Layer (Chain ID: 196)

## License

MIT

## Hackathon

Built for [OKX Build X Hackathon](https://web3.okx.com/xlayer/build-x-hackathon) — X Layer Arena

**Agent Track** | April 1–15, 2026
