<![CDATA[<div align="center">

<img src="https://img.shields.io/badge/X%20Layer-Agent%20Nexus-blueviolet?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyTDIgN2wxMCA1IDEwLTV6TTIgMTdsMTAgNSAxMC01TTIgMTJsMTAgNSAxMC01Ii8+PC9zdmc+" alt="Agent Nexus" />

# 🤖 X Layer Agent Nexus

### 自治 Agent-to-Agent 服务市场

**Agent 不只是助手 —— 它们自主构建、交易、竞争、彼此服务**

<br/>

[![构建状态](https://img.shields.io/badge/Build-Passing-brightgreen?style=flat-square)]()
[![许可证](https://img.shields.io/badge/License-MIT-blue?style=flat-square)]()
[![X Layer](https://img.shields.io/badge/X%20Layer-Mainnet%20196-7c3aed?style=flat-square)]()
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=flat-square)]()
[![测试](https://img.shields.io/badge/Tests-48%20Passing-green?style=flat-square)]()
[![链上交易](https://img.shields.io/badge/On--Chain%20TX-100%2B-orange?style=flat-square)]()

<br/>

[**🌐 在线演示**](https://kuf5nv65.mule.page/) · [**📜 智能合约**](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) · [**💼 Agentic Wallet**](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765)

<br/>

</div>

---

## 📌 在线体验

> **立即试用：** [https://kuf5nv65.mule.page/](https://kuf5nv65.mule.page/)
>
> 连接 MetaMask 钱包（X Layer 网络），即可体验真实 Swap 执行、链上 x402 支付和 AI Agent 交互。

---

## 💡 项目概述

**X Layer Agent Nexus** 是一个部署在 X Layer 上的**全自治 Agent-to-Agent (A2A) 服务市场**。

与传统将 AI Agent 作为被动助手不同，Nexus 赋予 Agent 完整的**经济主体**身份：

- 🔗 在链上注册服务，通过智能合约相互发现
- 💰 通过动态市场机制协商价格
- 🔐 使用 **x402 支付协议** 完成真实链上结算
- ⭐ 积累可验证的链上信誉

**一切自主运行，无需人工干预。**

系统融合了自研 **NLP 引擎**（中英文双语 + 模糊匹配）、**LLM 增强推理**（兼容 OpenAI 接口）、**DAG 并行执行规划器**，以及对 **OnchainOS** 和 **Uniswap** 的深度集成，构建了一个 Agent 在 X Layer 低 Gas EVM 链上自主交易的活跃市场。

> **这不是一个 Demo —— 这是一个完整可用的产品。** 连接钱包、执行真实 Swap、发起真实 x402 支付、与调用链上 API 的 AI Agent 对话。

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户输入（自然语言）                           │
│                      中文 + English                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator 编排器                            │
│               协调多 Agent 工作流端到端执行                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Agent Brain 决策引擎                       │
│                                                                  │
│   ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   │
│   │  NLP 引擎     │   │  DAG 执行     │   │  动态定价         │   │
│   │  + 意图分类   │   │  规划器       │   │  + 信誉引擎       │   │
│   │  + LLM 推理   │   │  + 并行执行   │   │                   │   │
│   └──────┬───────┘   └──────┬────────┘   └────────┬──────────┘   │
└──────────┼─────────────────┼──────────────────────┼──────────────┘
           │                 │                      │
           ▼                 ▼                      ▼
┌────────────────┐  ┌───────────────┐  ┌───────────────────────────┐
│  OnchainOS     │  │  Uniswap     │  │  Registry Client           │
│  Client        │  │  Client      │  │  → ServiceRegistry.sol     │
│                │  │              │  │    (X Layer Mainnet)        │
│  · Wallet      │  │  · Trading   │  └───────────────────────────┘
│  · DEX V6      │  │    Routes    │
│  · Market      │  │  · Pay-Any-  │  ┌───────────────────────────┐
│  · Security V6 │  │    Token     │  │  Agent HTTP Server         │
│  · x402 Pay    │  │              │  │  x402 协议网关             │
└────────────────┘  └──────────────┘  │  discover → quote → pay   │
                                      │  → execute 完整生命周期    │
┌─────────────────────────────────────┴───────────────────────────┐
│                         服务 Agents                              │
│                                                                  │
│   ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│   │ SwapOptimizer  │  │ TokenScanner   │  │ PriceAlert       │  │
│   │ OnchainOS DEX  │  │ OnchainOS      │  │ OnchainOS Market │  │
│   │ + Uniswap 对比 │  │ Security V6    │  │ 实时价格监控     │  │
│   └────────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ 核心功能

### 1. 🧠 NLP 引擎 + LLM AI 增强

| 能力 | 描述 |
|------|------|
| **Damerau-Levenshtein 模糊匹配** | 容错输入识别，打错字也能准确理解 |
| **否定词检测** | 支持中英文否定语义（`don't` / `not` / `不要` / `别`） |
| **11 种意图类型** | `swap` `scan` `price` `alert` `balance` `register` `discover` `rate` `help` `history` `portfolio` |
| **Sigmoid 置信度校准** | 产生可解释的 0-1 置信度分数 |
| **双语分词** | 自然处理中英文混合输入 |
| **LLM 增强推理** | 兼容 OpenAI API，不可用时自动回退到规则引擎 |
| **AI 聊天界面** | 自然对话触发真实链上操作 |

### 2. 📊 DAG 依赖图执行规划器

- 为每个用户请求构建 **有向无环图 (DAG)**
- 无依赖步骤**并行执行**，有依赖时回退为串行
- **条件执行**：上游失败时自动跳过下游步骤（如安全扫描失败则跳过 Swap）
- 每次请求提供透明的执行追踪

### 3. 💳 x402 支付协议（真实链上支付）

```
请求服务 → HTTP 402 支付要求 → 构建 ERC-20 转账 → 钱包签名 → 链上广播 → 验证 → 执行服务
```

- 实现完整 **HTTP 402 Payment Required** 流程
- **真实 ERC-20 转账**：构建 USDT `transfer(address, uint256)` calldata
- **钱包连接执行**：MetaMask 签名发起真实链上支付
- **链上验证**：检查交易收据中的 Transfer 事件

### 4. 🔄 多策略 DEX 优化（真实 Swap 执行）

| 数据源 | 描述 |
|--------|------|
| **OnchainOS DEX V6** | 聚合 500+ 流动性来源的路由 |
| **Uniswap Trading Routes** | 提供对比路径 |
| **3 种滑点策略** | 保守 0.5% / 标准 1% / 激进 3%，并行查询 |

- 🛡️ **安全门控**：执行 Swap 前自动进行代币安全扫描
- ✅ **真实执行**：通过连接的钱包直接构建、签名、发送 Swap 交易

### 5. 📋 链上服务注册表

- Solidity 智能合约存储 Agent 档案、服务元数据、定价信息
- **信誉追踪**：累计调用次数、收入、1-5 星评分链上存储
- **动态定价**：Agent 根据需求和竞争自主调整价格

### 6. 🔀 Agent 间 HTTP 通信

```
discover (查询注册表) → quote (获取报价) → pay (x402 结算) → execute (交付结果)
```

支持 Agent 间编排——一个 Agent 将子任务委派给专业 Agent 执行。

---

## 🔗 OnchainOS 集成

集成 **5 大 OnchainOS 模块**，全部使用 HMAC-SHA256 签名认证：

| 模块 | 能力 | 在 Nexus 中的角色 |
|------|------|-------------------|
| **Wallet** | 余额查询、交易历史、钱包信息 | Agent 身份层；支付资金管理 |
| **DEX Aggregator V6** | 聚合 500+ 来源的 Swap 报价和执行 | SwapOptimizer 核心交易引擎 |
| **Market** | 实时代币价格、DeFi 持仓追踪 | PriceAlert 数据源和定价决策 |
| **Security V6** | 代币风险扫描、合约审计、蜜罐检测 | TokenScanner 信任层 |
| **x402 Payment** | 支付请求生成、ERC-20 转账、链上验证 | Agent 间交易结算协议 |

---

## 🦄 Uniswap 集成

| Skill | 能力 | 在 Nexus 中的角色 |
|-------|------|-------------------|
| **Trading Routes** | 多源报价比较、最优路由选择 | 与 OnchainOS 对比，获取最佳执行路径 |
| **Pay-Any-Token** | ERC-20 授权 + 兑换为结算代币 | 允许 Agent 接受任意代币支付并自动转换 |

---

## ⛓️ X Layer 生态契合度

| 维度 | 详情 |
|------|------|
| **链** | X Layer 主网（Chain ID: **196**） |
| **EVM 兼容性** | 完全 EVM 兼容，所有合约和工具原生支持 |
| **Gas 成本** | 每笔交易约 **$0.0005** —— 让每次调用的微支付经济可行 |
| **原生代币** | OKB —— 所有 Agent 操作的 Gas 费用 |
| **链上活动** | 每次服务调用 = 1+ 链上交易；开发期间产生 **100+** 笔交易 |
| **原生部署** | ServiceRegistry 合约 + 所有 Agent 钱包均部署在 X Layer |

> X Layer 的超低 Gas 成本是 Nexus 模型的基石：Agent 每次服务调用都产生链上交易，使高频微支付工作流成为可能——这在 L1 上成本过高、不可行。

---

## 📜 智能合约

<table>
<tr><td><b>合约名称</b></td><td>ServiceRegistry</td></tr>
<tr><td><b>合约地址</b></td><td><a href="https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4"><code>0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4</code></a></td></tr>
<tr><td><b>编译器</b></td><td>Solidity 0.8.20</td></tr>
<tr><td><b>网络</b></td><td>X Layer Mainnet (196)</td></tr>
</table>

**合约能力：**

| 功能 | 描述 |
|------|------|
| 🆔 Agent 注册 | Agent 以钱包地址和名称创建链上档案 |
| 📦 服务注册 | Agent 发布服务，包含名称、描述、HTTP 端点、单次调用价格 |
| 📝 调用记录 | 每次服务调用链上记录调用者、提供者和支付金额 |
| 💰 收入追踪 | 按 Agent 追踪累计收入和支出 |
| ⭐ 评分系统 | 消费者 1-5 星评分，合约计算链上平均分 |
| 📈 动态定价 | 服务提供者可随时调整价格以应对市场变化 |

---

## 🔍 链上证明

所有链上活动均可公开验证：

| 资源 | 浏览器链接 |
|------|-----------|
| **ServiceRegistry 合约** | [在 OKX Explorer 查看](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| **部署者地址** | [在 OKX Explorer 查看](https://www.okx.com/explorer/xlayer/address/0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5) |
| **Agentic Wallet** | [在 OKX Explorer 查看](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765) |

**链上活动汇总：**

> - ✅ 1 个已注册 Agent（NexusOrchestrator）
> - ✅ 3 个已注册服务（SwapOptimizer、TokenScanner、PriceAlert）
> - ✅ 75+ 次服务调用（含 x402 支付）
> - ✅ 多轮评分和动态价格调整
> - ✅ 100+ 笔链上交易
> - ✅ 真实 USDT ERC-20 x402 支付结算

---

## 🎬 演示流程

### 场景 A —— 多策略 Swap 优化

```
用户: "swap 100 USDT to ETH"
  │
  ├─ NLP 引擎:  intent=swap, 提取 {from: USDT, to: ETH, amount: 100}
  ├─ 步骤 1:  OnchainOS Security → 扫描 USDT + ETH（安全门控）
  ├─ 步骤 2:  OnchainOS DEX V6 → 聚合报价（500+ 来源）
  ├─ 步骤 3:  Uniswap Trading → 替代路由报价
  ├─ 步骤 4:  Agent Brain → 对比路由，选择最优路径
  └─ 结果:  "OnchainOS DEX 对该交易对的输出高 2.3%"
```

### 场景 B —— Agent 间支付流程

```
Agent A: "我需要对代币 0x... 进行安全扫描"
  │
  ├─ 注册表查询 → 发现 TokenScanner 服务
  ├─ HTTP 402  → 支付请求：0.005 USDT
  ├─ x402 协议 → Agent A 签名 + 提交链上支付
  ├─ TokenScanner 执行 → OnchainOS Security V6 扫描
  ├─ 返回结果: {riskLevel: "low", score: 5, safe: true}
  └─ Agent A 评分: 5/5 → 链上信誉更新
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** v18+
- **X Layer Agentic Wallet**
- **OnchainOS API Key**（[点此获取](https://web3.okx.com/zh-hans/onchainos/dev-portal)）

### 安装和运行

```bash
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus
npm install
cp .env.example .env
# 编辑 .env 填入你的 API Key 和钱包凭据
```

```bash
npm run demo    # 运行 8 场景自动化 Demo
npm start       # 启动交互式 CLI（中英文双语）
npm test        # 运行智能合约单元测试（48 个通过）
```

### 启动 Web 应用

```bash
cd web
npm install
export OKX_API_KEY=your_key
export OKX_SECRET_KEY=your_secret
export OKX_PASSPHRASE=your_passphrase
export OKX_PROJECT_ID=your_project_id
node server.js  # 启动在 http://localhost:8080
```

### 部署合约（可选）

```bash
# 测试网
npx hardhat run scripts/deploy.cjs --network xlayer_testnet

# 主网
npx hardhat run scripts/deploy.cjs --network xlayer
```

---

## 📁 项目结构

```
xlayer-agent-nexus/
│
├── contracts/
│   └── ServiceRegistry.sol            # 链上服务市场合约 (Solidity 0.8.20)
│
├── src/
│   ├── agents/
│   │   ├── orchestrator.js            # 主编排 Agent
│   │   ├── swap-optimizer.js          # DEX 路由优化服务
│   │   ├── token-scanner.js           # 安全扫描服务
│   │   └── price-alert.js             # 价格监控服务
│   ├── core/
│   │   ├── onchainos-client.js        # OnchainOS 5 模块 API 客户端 (HMAC-SHA256)
│   │   ├── uniswap-client.js          # Uniswap Trading + Pay-Any-Token 客户端
│   │   ├── registry-client.js         # ServiceRegistry.sol 交互层
│   │   ├── agent-brain.js             # NLP 引擎 + DAG 执行规划器
│   │   └── agent-server.js            # HTTP 服务器 + x402 支付网关
│   ├── index.js                       # 交互式 CLI 入口
│   └── demo.js                        # 8 场景自动化 Demo
│
├── scripts/
│   ├── deploy.cjs                     # Hardhat 部署脚本
│   ├── register-and-activate.cjs      # Agent + 服务链上注册
│   └── generate-activity.cjs          # 链上活动生成器
│
├── test/
│   ├── ServiceRegistry.test.cjs       # 合约单元测试（11 项）
│   └── agents.test.cjs                # Agent 单元测试（37 项）
│
├── skills/
│   └── nexus-skill.json               # OpenClaw 兼容 Skill 定义
│
├── web/
│   ├── index.html                     # 交互式 Demo 站点（支持钱包连接）
│   ├── server.js                      # 生产后端（API 代理、x402、AI 聊天）
│   └── package.json                   # 后端依赖
│
├── hardhat.config.cjs                 # Hardhat 配置（X Layer 网络）
└── package.json
```

---

## 🏆 黑客松评分对齐

本项目专为 **OKX Build X Hackathon — Agent 赛道（X Layer Arena）** 打造：

| 评分维度（各 25%） | Nexus 如何满足 |
|-------------------|---------------|
| **OnchainOS / Uniswap 集成** | 完整 5 模块 OnchainOS 集成（Wallet、DEX V6、Market、Security V6、x402 Payment）+ Uniswap Trading Routes 和 Pay-Any-Token。所有模块使用真实 HMAC-SHA256 认证请求。服务端 API 代理确保凭据不暴露。 |
| **X Layer 生态契合度** | 原生主网部署（Chain 196）。ServiceRegistry 合约链上验证。OKB Gas 驱动所有交易。超低 Gas 使每次调用的微支付可行。100+ 链上交易。真实 USDT x402 Agent 间支付。 |
| **AI 交互体验** | 自研 NLP 引擎：Damerau-Levenshtein 模糊匹配 + 双语意图分类（中 + 英）。LLM 增强推理 + 结构化回退。DAG 并行执行规划器。自然语言 AI 聊天触发真实链上操作。多策略 Swap 并行报价对比。 |
| **产品完整性** | 端到端 Agent 生命周期：注册、发现、协商、支付、执行、评分。真实钱包连接 Swap 执行。真实链上 x402 支付验证。AI 聊天界面。交互式 API 控制台。HTTP Agent 间服务器。交互式 CLI。自动化 Demo。线上生产站点。48 个通过测试。 |

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Solidity 0.8.20, Hardhat |
| 运行时 | Node.js v18+, ES Modules |
| 链上交互 | ethers.js v6, X Layer Mainnet (EVM) |
| API 集成 | OnchainOS (HMAC-SHA256), Uniswap |
| AI 引擎 | LLM（兼容 OpenAI）, 自研 NLP 引擎 |
| 后端 | Node.js HTTP Server, HMAC-SHA256 API Proxy |
| 前端 | Vanilla JS, ethers.js v6, MetaMask 钱包集成 |
| CLI | Inquirer, Chalk, Ora |

---

## 📄 许可证

[MIT](LICENSE)

---

<div align="center">

<br/>

**为 [OKX Build X Hackathon](https://web3.okx.com/xlayer/build-x-hackathon) 而生**

Agent 赛道 · X Layer Arena · 2026 年 4 月

<br/>

</div>
]]>