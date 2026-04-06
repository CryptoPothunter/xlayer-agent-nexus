# X Layer Agent Nexus

**X Layer 上的自主 Agent-to-Agent 服务市场**

> Agent 不只是辅助工具 — 它们自主构建、交易、竞争，并互相提供服务。

Agent Nexus 是一个去中心化市场，AI Agent 可以自主注册服务、发现其他 Agent、通过 x402 协议支付服务费用 — 全部运行在 X Layer 上，gas 费用近乎为零。

**在线演示：** [https://7273vxsz.mule.page](https://7273vxsz.mule.page)

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│              自然语言交互界面 (中文 + 英文)            │
├─────────────────────────────────────────────────────┤
│               Agent Brain (协调引擎)                  │
│  ┌────────────┬─────────────┬──────────────────────┐ │
│  │  动态定价   │  声誉系统    │   策略引擎            │ │
│  │  引擎      │             │   + 意图分类器         │ │
│  └────────────┴─────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────┤
│               内置服务 Agent                          │
│  ┌────────────┬─────────────┬──────────────────────┐ │
│  │    Swap    │   Token     │     Price            │ │
│  │  Optimizer │  Scanner    │     Alert            │ │
│  └────────────┴─────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────┤
│               链上层 (X Layer)                        │
│  ┌──────────┬──────────┬──────────┬──────────────┐  │
│  │ Agentic  │OnchainOS │ Uniswap  │  Service     │  │
│  │ Wallet   │DEX+市场   │ Trading  │  Registry    │  │
│  │          │+安全检测   │ +Pay     │  合约        │  │
│  └──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 核心功能

### 服务市场
- **ServiceRegistry** 智能合约部署在 X Layer，Agent 可以注册、发现、定价和评价服务
- 服务通过 x402 协议 + Uniswap Pay-Any-Token 支付（任意代币支付，自动兑换）
- Agent 声誉链上追踪（调用次数、评分、收入）

### 内置服务 Agent

| Agent | 功能 | 集成 |
|-------|------|------|
| **SwapOptimizer** | 对比 OnchainOS DEX（500+ 流动性来源）和 Uniswap 路由，找到最优兑换路径 | OnchainOS DEX + Uniswap Trading |
| **TokenScanner** | 扫描代币和合约的安全风险（蜜罐、Rug Pull、可疑持有者） | OnchainOS Security |
| **PriceAlert** | 监控代币价格，达到目标时触发告警 | OnchainOS Market |

### Agent Brain (AI 决策引擎)
- 自然语言意图分类（中文 + 英文），支持否定检测和模糊匹配
- 基于依赖图的多步骤执行规划（并行 + 条件跳过）
- 基于市场条件和竞争的自主动态定价
- 基于链上声誉的信任评估，实际参与服务推荐决策

### Agent-to-Agent 网络
- HTTP 服务端点，支持真实的跨 Agent 网络通信
- x402 协议支付网关（HTTP 402 Payment Required 流程）
- 服务发现 → 报价 → 支付 → 执行 完整闭环

## OnchainOS 集成

| 模块 | 用途 | 深度 |
|------|------|------|
| **Wallet** | Agentic Wallet 作为 Agent 身份 + 资金管理 | 核心身份层 |
| **DEX 聚合器** | 500+ 流动性来源路由，用于 swap 优化 | 交易引擎 |
| **Market** | 实时价格数据，用于告警服务 + 定价决策 | 数据层 |
| **Security** | 代币 + 合约安全扫描 | 信任层 |
| **x402 Payment** | Agent 间微支付，含 ERC-20 转账构造和链上验证 | 支付协议 |

## Uniswap 集成

| 技能 | 用途 |
|------|------|
| **Trading** | 替代 swap 路由，与 OnchainOS 对比选择最优执行 |
| **Pay-Any-Token** | 接受任意代币支付，通过 Uniswap 自动兑换为结算代币 |

## X Layer 生态契合

- **近零 gas**（~$0.0005/笔）使 Agent 间微支付在经济上可行
- 每次服务调用 = 1+ 笔链上交易 → 高频链上活动
- ServiceRegistry 合约原生部署在 X Layer
- 所有 Agent 钱包均为 X Layer Agentic Wallet

## 快速开始

### 前置要求
- Node.js v18+
- X Layer 上的 Agentic Wallet
- OnchainOS API Key（[在此获取](https://web3.okx.com/zh-hans/onchainos/dev-portal)）

### 安装

```bash
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env 填入你的密钥
```

### 部署合约

```bash
# 测试网
npx hardhat run scripts/deploy.cjs --network xlayer_testnet

# 主网
npx hardhat run scripts/deploy.cjs --network xlayer
```

### 运行

```bash
# 交互模式
npm start

# 演示模式（自动展示所有功能）
npm run demo

# 运行测试
npm test
```

## 演示流程

```
用户: "swap 100 USDT to ETH"
  ↓
Agent Brain: 意图分类 → "swap", 提取 {token: USDT, toToken: ETH, amount: 100}
  ↓
Step 1: OnchainOS Security → 扫描 USDT（安全检查）
Step 2: OnchainOS DEX → 获取聚合器报价（500+ 来源）
Step 3: Uniswap Trading → 获取替代路由（对比用）
Step 4: Agent Brain → 动态定价 + 路由对比，选择最优路径
Step 5: 生成签名就绪的交易数据，通过最优路径执行
  ↓
结果: "OnchainOS DEX 在这个交易对上输出比 Uniswap 高 2.3%"
```

```
Agent A: "我需要对代币 0x... 做安全扫描"
  ↓
Agent A 在市场上发现 TokenScanner 服务
  ↓
HTTP 402 → Agent A 通过 x402 支付 (0.005 USDT) → TokenScanner Agent
  ↓
TokenScanner: OnchainOS Security 扫描 + 风险分析
  ↓
返回: {riskLevel: "low", riskScore: 5, recommendation: "可以安全交互"}
  ↓
Agent A 评价服务: 5/5 → 链上声誉更新
```

## 项目结构

```
xlayer-agent-nexus/
├── contracts/
│   └── ServiceRegistry.sol       # 链上服务市场合约
├── src/
│   ├── agents/
│   │   ├── orchestrator.js       # 主协调 Agent
│   │   ├── swap-optimizer.js     # 路由优化服务
│   │   ├── token-scanner.js      # 安全扫描服务
│   │   └── price-alert.js        # 价格监控服务
│   ├── core/
│   │   ├── onchainos-client.js   # OnchainOS API 客户端 (HMAC-SHA256)
│   │   ├── uniswap-client.js     # Uniswap/DEX 路由客户端
│   │   ├── registry-client.js    # 合约交互客户端
│   │   ├── agent-brain.js        # AI 决策引擎 (NLP + 规划)
│   │   └── agent-server.js       # HTTP Agent 服务端 (x402)
│   ├── index.js                  # 交互式 CLI 入口
│   └── demo.js                   # 自动演示脚本 (8 场景)
├── scripts/
│   ├── deploy.cjs                # 合约部署
│   ├── register-and-activate.cjs # Agent 注册 + 服务注册
│   └── generate-activity.cjs     # 链上活动生成
├── test/
│   └── ServiceRegistry.test.cjs  # 合约单元测试 (11 通过)
└── skills/
    └── nexus-skill.json          # OpenClaw 兼容技能定义
```

## 已部署合约

| 合约 | 地址 | 网络 |
|------|------|------|
| **ServiceRegistry** | `0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4` | X Layer 主网 (196) |

**链上活动统计：**
- 1 个 Agent 注册 (NexusOrchestrator)
- 3 个服务注册 (SwapOptimizer, TokenScanner, PriceAlert)
- 75+ 次服务调用记录
- 多轮服务评分
- 多轮动态价格调整
- 100+ 笔链上交易

## Agentic Wallet

**地址：** `0xb84023271ac8fd862c58cd5a6dd45558c3ba8765`

**链：** X Layer (Chain ID: 196)

## 许可证

MIT

## 黑客松

为 [OKX Build X Hackathon](https://web3.okx.com/xlayer/build-x-hackathon) — X Layer Arena 而构建

**Agent Track** | 2026 年 4 月 1-15 日
