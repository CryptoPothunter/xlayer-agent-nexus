![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![X Layer](https://img.shields.io/badge/X%20Layer-Chain%20196-blue)
![OnchainOS](https://img.shields.io/badge/OnchainOS-5%20Modules-purple)
![Mainnet TX](https://img.shields.io/badge/Mainnet%20TX-100%2B-green)
![Tests](https://img.shields.io/badge/Tests-48%20Passing-brightgreen)

# X Layer Agent Nexus

> **一句话定位**: Nexus 是 X Layer 上首个自治 Agent-to-Agent 服务市场 — Agent 不再是被动工具，而是自主注册服务、发现彼此、链上支付、积累信誉的经济主体。

**[🌐 Live Demo](https://kuf5nv65.mule.page/)** · **[📜 智能合约](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4)** · **[💼 Agentic Wallet](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765)**

> **OKX Build X Hackathon** 参赛项目 (奖池 14,000 USDT)

---

## 场景：一个 DeFi Agent 的深夜

> 凌晨 2:00，一个 DeFi Agent 需要在 X Layer 上完成一笔 100 USDT → ETH 的 Swap。传统方案：调一个 API，接受单一报价，完事。没有比价、没有安全检查、没有记录。
>
> **如果它接入了 Agent Nexus** — 2:00:01，Agent 向链上 ServiceRegistry 发起查询，发现 3 个专业服务 Agent；2:00:02，SwapOptimizer 返回多策略报价：OnchainOS DEX 聚合 500+ 来源 vs Uniswap 路由，三种滑点策略并行比价；2:00:03，TokenScanner 完成安全扫描确认代币无蜜罐风险；2:00:04，x402 协议发起 0.005 USDT 微支付结算服务费，链上 Transfer 事件验证通过；2:00:05，最优路由执行，输出比单一来源高 2.3%。Agent Brain 记录完整决策链路，链上信誉 +1。
>
> **全程自主完成。没有人类参与。这就是 Agent Nexus 构建的世界：一个 Agent 为 Agent 服务的链上经济体。**

---

## 评委快速体验指南 (3 分钟)

> 无需安装任何依赖，3 分钟体验全部核心功能。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 打开 [Live Demo](https://kuf5nv65.mule.page/) | 页面加载，链上数据面板自动刷新 |
| 2 | 查看 **Dashboard** | 实时展示链上注册的 Agent、服务数、调用次数、信誉评分 |
| 3 | 体验 **Agent Brain** | 输入 "swap 100 USDT to ETH"（中英文均可），观看 NLP 意图分类 + DAG 并行执行 |
| 4 | 体验 **x402 支付流程** | 完整的 discover → quote → HTTP 402 → pay → execute → rate 生命周期 |
| 5 | 连接 OKX Wallet / MetaMask | 执行真实 Swap、真实链上 USDT 支付、服务注册 |
| 6 | 查看 [OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) | 验证 100+ 笔主网真实交易 |

---

## 一、创新性：为什么这个项目「前所未有」

### 1.1 核心创新：Agent 经济体 × x402 支付协议

现有 AI Agent 项目大多是**用户→Agent 的单向助手模型**（Agent 是工具）。Nexus 的创新在于构建了 Agent→Agent 的双向服务市场：

```
传统 Agent:  [用户] → [Agent 执行任务] → [返回结果]               (Agent 是被调用的函数)
Nexus:       [Agent A] → [链上注册表发现] → [报价协商] → [x402 链上支付] → [Agent B 执行]
             → [结果返回] → [链上评分] → [信誉累积] → [动态定价调整]  (Agent 是经济主体)
```

**关键差异**：Agent 拥有链上身份、收入、信誉、定价权。它们不是被调用的函数，而是自主经营的服务提供者。

### 1.2 NLP 引擎 + LLM 增强推理

不是简单的关键词匹配，而是完整的语言理解引擎：

| 能力 | 技术实现 |
|------|---------|
| 模糊匹配 | Damerau-Levenshtein 编辑距离，打错字也能准确识别意图 |
| 否定检测 | 中英文双语（`don't` / `not` / `不要` / `别`） |
| 意图分类 | 11 类意图，Sigmoid 置信度校准 (0-1 分数) |
| 双语分词 | 自然处理中英文混合输入（如 "帮我 swap 100 USDT"） |
| LLM 推理 | 兼容 OpenAI API，不可用时自动回退规则引擎 |

### 1.3 DAG 并行执行规划器

为每个用户请求构建**有向无环图 (DAG)**，无依赖步骤并行执行：

```
用户: "swap 100 USDT to ETH"
  │
  ├─ [并行] Step 1a: OnchainOS Security 扫描 USDT
  ├─ [并行] Step 1b: OnchainOS Security 扫描 ETH
  │         ↓ (安全门控通过)
  ├─ [并行] Step 2a: OnchainOS DEX V6 报价 (500+ 来源)
  ├─ [并行] Step 2b: Uniswap Trading Routes 报价
  │         ↓
  └─ Step 3: Agent Brain 对比路由 → 选择最优路径 → 执行
```

条件执行：安全扫描失败 → 自动跳过 Swap。每次请求提供完整执行追踪。

### 1.4 x402 支付协议：Agent 服务的结算层

```
请求服务 → HTTP 402 Payment Required → 报价 (金额+代币+收款方)
→ 构建 ERC-20 USDT transfer calldata → 钱包签名 → 链上广播
→ 验证 Transfer 事件 → 服务执行 → 链上评分
```

连接钱包后支持**真实链上 USDT 支付**，通过 Uniswap Pay-Any-Token 支持任意代币结算。

---

## 二、实用性：解决什么真实问题

### 2.1 Agent 协作的真实痛点

| 问题 | 现状 | Nexus 方案 |
|------|------|-----------|
| Agent 发现 | 硬编码 API 端点，无法动态发现新服务 | 链上 ServiceRegistry，任何 Agent 可注册/发现/调用 |
| 服务定价 | 固定费率或免费，无市场机制 | 动态定价 + 链上信誉 + 基于需求的自动调价 |
| 支付结算 | 中心化账户或无支付，不可验证 | x402 协议 — 真实 ERC-20 链上转账，公开可验证 |
| 信任机制 | 无法验证服务质量 | 链上 1-5 星评分 + 累计调用/收入，合约强制执行 |
| 安全保障 | 盲目调用，无风险检查 | 每次 Swap 前自动代币安全扫描（蜜罐检测、合约审计） |

### 2.2 三个核心服务 Agent

| Agent | 功能 | 数据源 | 链上收费 |
|-------|------|--------|---------|
| **SwapOptimizer** | 多源路由对比，选择最优 Swap 路径 | OnchainOS DEX V6 (500+ 来源) + Uniswap Routes | 0.01 USDT/次 |
| **TokenScanner** | 代币风险评分 (0-100)，蜜罐检测，合约审计 | OnchainOS Security V6 | 0.005 USDT/次 |
| **PriceAlert** | 实时价格监控 (30s 间隔)，触发条件回调 | OnchainOS Market | 0.005 USDT/次 |

### 2.3 真实链上活动 (非模拟)

**100+ 笔 X Layer 主网交易**，全部可在 OKX Explorer 公开验证：

- 1 个已注册 Agent (NexusOrchestrator) + 3 个已注册服务
- 75+ 次服务调用 (含 x402 USDT 真实支付)
- 多轮评分 (1-5 星) + 动态价格调整
- 真实 ERC-20 USDT 转账结算

---

## 三、技术深度：怎么做到的

### 3.1 系统架构

```
用户输入 (自然语言 中文/English)
    ↓
Orchestrator 编排器 — 协调多 Agent 工作流
    ↓
Agent Brain 决策引擎
    ↓ 意图分类 + DAG 规划 + 动态定价
┌──────────────┬──────────────┬──────────────────────────────────┐
│ OnchainOS    │ Uniswap     │ Registry Client                  │
│ · Wallet     │ · Trading   │ → ServiceRegistry.sol            │
│ · DEX V6     │   Routes    │   (X Layer Mainnet Chain 196)    │
│ · Market     │ · Pay-Any-  │                                  │
│ · Security V6│   Token     │ Agent HTTP Server                │
│ · x402 Pay   │             │ x402 协议网关                    │
└──────────────┴──────────────┤ discover→quote→pay→execute      │
                              └──────────────────────────────────┘
    ↓
┌────────────────┬────────────────┬────────────────┐
│ SwapOptimizer  │ TokenScanner   │ PriceAlert     │
│ DEX 路由优化   │ 安全扫描       │ 价格监控       │
│ OnchainOS +    │ OnchainOS      │ OnchainOS      │
│ Uniswap 对比   │ Security V6    │ Market         │
└────────────────┴────────────────┴────────────────┘
```

### 3.2 智能合约：ServiceRegistry

Solidity 0.8.20，部署在 X Layer 主网 (Chain 196)：

- **Agent 注册**: 链上创建 Agent 档案（钱包地址 + 名称）
- **服务注册**: 发布服务 — 名称、描述、HTTP 端点、单次调用价格
- **调用记录**: 每次调用链上记录 caller、provider、支付金额
- **收入追踪**: 按 Agent 累计收入/支出
- **评分系统**: 1-5 星评分，合约计算链上平均分
- **动态定价**: 服务提供者随时调整价格应对市场变化

### 3.3 OnchainOS 集成 (5 模块，HMAC-SHA256 认证)

| 模块 | 能力 | 在 Nexus 中的角色 |
|------|------|-------------------|
| **Wallet** | 余额查询、交易历史 | Agent 身份层 + 支付资金管理 |
| **DEX Aggregator V6** | 500+ 来源聚合报价 + 执行 | SwapOptimizer 核心交易引擎 |
| **Market** | 实时代币价格、DeFi 持仓 | PriceAlert 数据源 |
| **Security V6** | 代币风险扫描、蜜罐检测 | TokenScanner 信任层 |
| **x402 Payment** | 支付请求、ERC-20 转账、链上验证 | Agent 间交易结算协议 |

### 3.4 Uniswap Skill 集成 (2 个)

| Skill | 用途 |
|-------|------|
| **Trading Routes** | 多源报价比较、最优路由，与 OnchainOS 对比获取最佳执行 |
| **Pay-Any-Token** | ERC-20 授权 + 兑换结算代币，允许 Agent 接受任意代币支付 |

### 3.5 多策略 DEX 优化

三种滑点策略并行查询，自动选择最优路由：

| 策略 | 滑点 | 适用场景 |
|------|------|---------|
| Conservative | 0.5% | 小额稳定交易 |
| Standard | 1.0% | 常规交易 |
| Aggressive | 3.0% | 大额/低流动性交易 |

**安全门控**: 每次 Swap 前自动执行代币安全扫描，检测到风险则中止交易。

### 3.6 测试覆盖

| 类型 | 数量 | 状态 |
|------|------|------|
| 合约单元测试 (Hardhat) | 11 | ✅ All pass |
| Agent 单元测试 | 37 | ✅ All pass |
| 总计 | **48** | ✅ All pass |

---

## 四、完成度：交付了什么

### 4.1 合约部署 (X Layer 主网 Chain 196)

| 合约 | 地址 |
|------|------|
| **ServiceRegistry** | [`0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4`](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| **Deployer** | [`0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5`](https://www.okx.com/explorer/xlayer/address/0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5) |
| **Agentic Wallet** | [`0xb84023271ac8fd862c58cd5a6dd45558c3ba8765`](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765) |

### 4.2 交付物清单

| 交付物 | 状态 | 验证方式 |
|--------|------|---------|
| ServiceRegistry 智能合约 | ✅ 已部署主网 | OKX Explorer 可查 |
| Live Demo (全功能交互前端) | ✅ 已上线 | [kuf5nv65.mule.page](https://kuf5nv65.mule.page/) |
| NLP 引擎 + LLM 增强推理 | ✅ 可运行 | Demo 实时演示 |
| DAG 并行执行规划器 | ✅ 已集成 | 自然语言输入触发 |
| x402 支付协议 | ✅ 真实 USDT | 钱包连接后可测 |
| 3 个服务 Agent (链上注册) | ✅ 已注册 | OKX Explorer 可查 |
| OnchainOS 5 模块集成 | ✅ HMAC-SHA256 | API 代理实时调用 |
| Uniswap 2 Skill 集成 | ✅ 已集成 | Swap 路由对比 |
| 真实 Swap 执行 | ✅ 钱包签名 | 链上交易记录 |
| Agent 间 HTTP 通信 + x402 网关 | ✅ 完整生命周期 | discover→quote→pay→execute |
| 测试套件 (48 tests) | ✅ 全通过 | `npm test` |
| 交互式 CLI (中英双语) | ✅ 可运行 | `npm start` |
| 8 场景自动化 Demo | ✅ 可运行 | `npm run demo` |
| 文档 | ✅ 完整 | 本 README |

---

## 五、生态契合度：为什么必须在 X Layer 上

### 5.1 X Layer 原生优势

| X Layer 特性 | Nexus 利用方式 |
|-------------|---------------|
| **Gas ≈ $0.0005/tx** | 每次服务调用 = 1+ 链上交易；微支付经济模型仅在超低 Gas 链上可行 |
| **完全 EVM 兼容** | Solidity + ethers.js 原生支持，零迁移成本 |
| **OKB 原生代币** | 所有 Agent 操作的 Gas 由 OKB 驱动 |
| **OKX 生态整合** | OnchainOS API + OKX DEX 聚合器 + Agentic Wallet 深度集成 |

### 5.2 链上活动证明

**100+ 笔主网交易**，全部公开可验证：

| 资源 | 链接 |
|------|------|
| ServiceRegistry 合约 | [OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4) |
| Deployer 地址 | [OKX Explorer](https://www.okx.com/explorer/xlayer/address/0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5) |
| Agentic Wallet | [OKX Explorer](https://www.okx.com/explorer/xlayer/address/0xb84023271ac8fd862c58cd5a6dd45558c3ba8765) |

---

## 工程调试记录 (Engineering Debug Log)

> 真实开发过程中遇到的关键问题及解决方案，展示工程深度。

### 问题 1: OnchainOS HMAC-SHA256 签名时间窗口严格

**现象**: API 返回 401，相同 Key 在 Postman 中正常工作。

**解决**: 服务器时间与 OKX 服务器存在 ~2s 偏差。改为每次请求使用 `new Date().toISOString()` 生成时间戳，确保签名在 30s 窗口内。同时实现服务端 API 代理，避免前端暴露 HMAC 凭据。

### 问题 2: x402 支付验证的 Transfer 事件解析

**现象**: 链上支付已确认，但 x402 网关报告验证失败。

**解决**: ethers.js v6 交易收据 logs 结构变更。改用 `receipt.logs.filter(log => log.topics[0] === transferTopic)` 手动解析 Transfer 事件，匹配 `from`/`to`/`value` 三要素完成支付验证。

### 问题 3: Uniswap V3 在 X Layer 上的流动性受限

**现象**: Uniswap Trading Routes 返回的报价明显低于 OnchainOS DEX 聚合器。

**解决**: X Layer 上 Uniswap V3 池流动性有限，OnchainOS 聚合 500+ 来源优势明显。代码中诚实标注差异，Uniswap 作为**对比基准**，UI 同时展示两个来源报价和差异百分比，让用户/Agent 选择最优路由。

### 问题 4: 中英文混合输入的意图误分类

**现象**: 输入 "帮我 swap 100 USDT" 时，分词器将中英文分别分类，置信度低。

**解决**: 实现双语分词器 — 先用正则拆分中英文 token，再分别计算意图匹配度，最终取加权最高分。同时添加否定词前置检查，防止 "不要 swap" 被误识别为 swap 意图。

### 问题 5: DAG 并行执行中的 OnchainOS 限速

**现象**: 安全扫描和 DEX 报价同时依赖 OnchainOS API，并行执行时偶发 rate limit 429。

**解决**: DAG 执行器增加并发度控制 (max 3 concurrent) + 请求队列 + 自动重试 (exponential backoff)。将无依赖步骤（如 USDT 扫描和 ETH 扫描）标记为同一并行层，避免不必要的串行等待。

---

## 评分维度对齐

| 评分维度 (各 25%) | Nexus 如何满足 |
|-------------------|---------------|
| **OnchainOS / Uniswap 集成** | 完整 5 模块 OnchainOS (Wallet + DEX V6 + Market + Security V6 + x402) + Uniswap Trading Routes + Pay-Any-Token。全部 HMAC-SHA256 真实认证。服务端 API 代理确保凭据不暴露。 |
| **X Layer 生态契合度** | 原生主网部署 (Chain 196)。ServiceRegistry 链上验证。OKB 驱动 Gas。超低 Gas 使微支付可行。100+ 链上交易。真实 USDT x402 支付。 |
| **AI 交互体验** | 自研 NLP (Damerau-Levenshtein + 双语意图分类)。LLM 增强 + 结构化回退。DAG 并行执行。AI 聊天触发真实链上操作。多策略 Swap 并行比价。 |
| **产品完整性** | 端到端 Agent 生命周期：注册→发现→协商→支付→执行→评分。真实 Swap + x402 支付。AI 聊天 + API 控制台 + HTTP Agent 服务器 + CLI + 自动化 Demo + 线上站点。48 测试全通过。 |

---

## 快速运行

```bash
# 克隆并安装
git clone https://github.com/CryptoPothunter/xlayer-agent-nexus.git
cd xlayer-agent-nexus
npm install
cp .env.example .env   # 编辑填入 API Key 和钱包凭据

# 运行
npm run demo            # 8 场景自动化 Demo
npm start               # 交互式 CLI (中英双语)
npm test                # 48 个测试

# Web 应用
cd web && npm install
export OKX_API_KEY=your_key
export OKX_SECRET_KEY=your_secret
export OKX_PASSPHRASE=your_passphrase
export OKX_PROJECT_ID=your_project_id
node server.js          # http://localhost:8080

# 部署合约 (可选)
npx hardhat run scripts/deploy.cjs --network xlayer
```

---

## 项目结构

```
xlayer-agent-nexus/
├── contracts/
│   └── ServiceRegistry.sol            链上服务市场合约 (Solidity 0.8.20)
├── src/
│   ├── agents/
│   │   ├── orchestrator.js            主编排 Agent
│   │   ├── swap-optimizer.js          DEX 路由优化服务
│   │   ├── token-scanner.js           安全扫描服务
│   │   └── price-alert.js             价格监控服务
│   ├── core/
│   │   ├── onchainos-client.js        OnchainOS 5 模块 API (HMAC-SHA256)
│   │   ├── uniswap-client.js          Uniswap Trading + Pay-Any-Token
│   │   ├── registry-client.js         ServiceRegistry.sol 交互层
│   │   ├── agent-brain.js             NLP 引擎 + DAG 执行规划器
│   │   └── agent-server.js            HTTP 服务器 + x402 支付网关
│   ├── index.js                       交互式 CLI 入口
│   └── demo.js                        8 场景自动化 Demo
├── scripts/
│   ├── deploy.cjs                     Hardhat 部署脚本
│   ├── register-and-activate.cjs      Agent + 服务链上注册
│   └── generate-activity.cjs          链上活动生成器
├── test/
│   ├── ServiceRegistry.test.cjs       合约单元测试 (11 项)
│   └── agents.test.cjs                Agent 单元测试 (37 项)
├── skills/
│   └── nexus-skill.json               OpenClaw 兼容 Skill 定义
├── web/
│   ├── index.html                     交互式 Demo 站点 (钱包连接)
│   ├── server.js                      生产后端 (API 代理 + x402 + AI 聊天)
│   └── package.json
├── hardhat.config.cjs                 Hardhat 配置 (X Layer 网络)
└── package.json
```

---

## 团队

| 成员 | 角色 |
|------|------|
| **CryptoPothunter** | 独立开发者 — 智能合约、Agent 引擎、前端、集成 |

## 许可证

MIT
