# OpenWallet

中文 | [English](README.md)

**作者：** Davey Wong <wgwcko@gmail.com>

开源、多链、非托管的加密货币钱包。私钥永不出设备 — 无后端依赖，完全可审计。

> ⚠️ **Alpha / 开发中** — 仍在积极开发，请勿存入大额资产。

## 功能特性

- HD 钱包创建 / 导入（BIP39 助记词 + 私钥）
- 多链统一资产管理：Ethereum、BNB Chain、Polygon、Arbitrum、Optimism、Base、Avalanche、Solana
- 原生代币 + ERC20/BEP20/SPL 代币余额
- 原生币发送，动态 Gas 估算（慢 / 中 / 快 / 自定义）
- 区块浏览器 API 查询交易历史
- 加密保险库：AES-256-GCM + PBKDF2-SHA512（20 万次迭代）
- 页面隐藏自动锁定（5 分钟），会话密钥仅存内存
- 暗 / 亮主题，中英文切换

## 技术栈

| 分层 | 技术 |
|------|------|
| 语言 | TypeScript 5.x |
| Monorepo | pnpm + Turborepo |
| Web | React 19 + Vite 6 + Zustand |
| 加密底层 | noble-curves、tweetnacl、bip39、@scure/bip32 |
| EVM | viem 2.x |
| Solana | @solana/web3.js |
| 存储 | 跨平台抽象（localStorage / MMKV / Tauri Store） |

## 仓库结构

```
open-wallet/
├── apps/
│   └── web/          # Web 应用（React + Vite + PWA）
├── packages/
│   ├── core/         # 钱包核心：密钥、保险库加密、会话、链抽象
│   ├── chains/       # 链适配器（EVM / Solana）
│   ├── ui/           # 共享 UI 组件
│   ├── shared/       # 共享类型、工具函数、常量
│   └── storage/      # 跨平台加密存储抽象
└── scripts/          # 开发工具（如 EVM 发送流程集成测试）
```

## 快速开始

```bash
pnpm install
pnpm dev          # 启动 Web 应用（Vite 开发服务器）
pnpm build        # 构建所有包 + Web
pnpm typecheck    # 全工作区类型检查
```

要求 Node.js >= 20.19，pnpm >= 9。

## 安全原则

- 私钥 / 助记词永不出设备，绝不上传
- 所有签名在本地完成
- 保险库 AES-256-GCM 加密，PBKDF2-SHA512（20 万次迭代）派生密钥
- 会话密钥仅存内存；失去页面可见性自动锁定

完整技术设计与安全审计清单见 `TECH_DESIGN.md`。

## 路线图

- Phase 1（当前）：MVP — 多链收发、加密保险库、Web 应用
- Phase 2：移动端（React Native）与桌面端（Tauri）、硬件钱包（Ledger）、NFT 视图、更多链
- Phase 3：DeFi — DApp 浏览器、Swap 聚合、质押、WalletConnect v2

## 许可证

Apache-2.0 — 见 [LICENSE](LICENSE)。版权所有 © 2026 Davey Wong — 见 [NOTICE](NOTICE)。

**作者：** Davey Wong <wgwcko@gmail.com> · [www.guangweiblog.com](https://www.guangweiblog.com)
