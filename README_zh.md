# skillsmcp

[English](./README.md) | [中文](./README_zh.md)

SkillShub (skillsmcp) — 本地技能注册表、语义搜索服务及 Model Context Protocol (MCP) 网关。

本项目提供了一个统一的平台，用于发现、管理和调用本地“技能”（代码封装）及 MCP 工具。它具有高性能的管理面板、基于 SBERT 的语义搜索以及专用的 MCP 微服务。

## 核心组件

- **api** — Node/Express 核心 API 服务（Prisma + SQLite），管理技能元数据与系统设置。
- **frontend** — Next.js 15+ 管理面板。采用渐进式加载技术，实现“秒开” UI 体验。
- **mcp-service** — 独立的 MCP 微服务（端口 8003），将本地技能桥接到 Model Context Protocol。
- **tools/skillshub** — FastAPI 服务（端口 8001），使用 SBERT/FAISS 对技能清单进行语义搜索。
- **tools/skill-loader-node** — 基于 Node 的工具，用于获取和验证技能清单。

## 系统架构

```
[MCP 客户端] <───> [mcp-service (8003)] <───> [api (8002)] <───> [SQLite]
                                                 ^
[浏览器] <───> [frontend (3000)] <──────────────┘
                    |
                    └─> [skillshub (8001)] <───> [SBERT/FAISS 索引]
```

## 快速开始

### 1. 环境要求

- **Node.js** v20+
- **Python** 3.10+
- **SQLite**

### 2. 初始化项目

执行初始化脚本以安装依赖并设置数据库：

```bash
./init.sh
```

### 3. 运行服务

您可以单独启动各组件，或使用提供的脚本：

- **MCP 服务**: `./start_mcp.sh` (运行在 8003 端口)
- **核心 API**: `npm run dev --workspace=api` (运行在 8002 端口)
- **前端页面**: `npm run dev --workspace=frontend` (运行在 3000 端口)
- **Skillshub**: 构建索引及启动方式详见 `tools/skillshub/README.md`。

## 核心特性

- **渐进式面板**: `/skills/index` 页面即时渲染，重数据组件异步加载，提供更流畅的交互体验。
- **MCP 集成**: 完全隔离的 MCP 服务，允许 LLM 通过标准协议与本地技能交互。
- **智能搜索**: 由 SBERT 驱动的语义搜索，支持 TF-IDF 回退，确保稳健的技能发现。
- **灵活配置**:
  - **代理支持**: 可通过 UI 为翻译引擎和 LLM 审计独立配置代理服务器。
  - **API Key 解析**: 支持直接输入明文或使用环境变量名（如 `OPENAI_API_KEY`），实现安全的凭据管理。

## 环境变量配置

将 `api/.env.example` 复制为 `api/.env` 并配置以下项：

- `DATABASE_URL`: `file:./dev.db`
- `JWT_SECRET`: 您的加密密钥
- `SKILLSHUB_API_KEY`: 用于索引管理

## 安全提示

- 技能在本地或容器环境中执行。请确保技能清单来源可靠。
- 如果将 `mcp-service` 或 `skillshub` 暴露于公共网络，请务必配置防火墙。

## 贡献指南

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可协议

Apache License 2.0。详见 [LICENSE](./LICENSE)。
