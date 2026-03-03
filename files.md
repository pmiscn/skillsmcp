# 项目文件说明 (Project Files Documentation)

## 项目概述 (Project Overview)

SkillShub (skillsmcp) 是一个本地技能注册中心、语义搜索服务和 Model Context Protocol (MCP) 网关。该项目提供了一个统一的平台来发现、管理和使用本地 "skills" (代码包装器) 和 MCP 工具。

---

## 根目录文件 (Root Directory Files)

### 配置文件 (Configuration Files)

| 文件                          | 说明                                           |
| ----------------------------- | ---------------------------------------------- |
| `package.json`                | Node.js 项目主配置文件，定义 workspaces 和依赖 |
| `package-lock.json`           | 锁定 Node.js 依赖版本                          |
| `pyproject.toml`              | Python 项目配置                                |
| `docker-compose.yml`          | Docker Compose 主配置，定义所有服务            |
| `docker-compose.override.yml` | Docker Compose 本地覆盖配置                    |
| `init.sh`                     | 项目初始化脚本，安装依赖和设置数据库           |
| `playwright.config.ts`        | Playwright E2E 测试配置                        |
| `.eslintrc.json`              | ESLint 代码检查配置                            |
| `.prettierrc`                 | Prettier 代码格式化配置                        |
| `.markdownlint.json`          | Markdown 格式检查配置                          |

### 启动脚本 (Startup Scripts)

| 文件                  | 说明             |
| --------------------- | ---------------- |
| `start_api_server.sh` | 启动 API 服务器  |
| `start_frontend.sh`   | 启动前端服务     |
| `start_mcp.sh`        | 启动 MCP 服务    |
| `start_skillshub.sh`  | 启动语义搜索服务 |
| `rebuild_index.sh`    | 重建搜索索引     |
| `start_backend.sh`    | 启动后端服务     |

### 文档文件 (Documentation Files)

| 文件                               | 说明              |
| ---------------------------------- | ----------------- |
| `README.md`                        | 项目主文档 (英文) |
| `README_zh.md`                     | 项目中文文档      |
| `CHANGELOG.md`                     | 更新日志          |
| `CONTRIBUTING.md`                  | 贡献指南          |
| `LICENSE`                          | Apache 2.0 许可证 |
| `COPYRIGHT_AND_RESERVED_RIGHTS.md` | 版权声明          |
| `ASSISTANT_PREFERENCES.md`         | AI 助手偏好设置   |
| `TODO.md`                          | 待办事项          |
| `Agents.md`                        | Agent 相关配置    |

---

## 核心目录 (Core Directories)

### `api/` - API 服务器

API 服务器，使用 Express + Prisma + SQLite。

```
api/
├── index.ts                    # 主入口，启动 Express 服务器
├── db.ts                       # Prisma 数据库客户端
├── prisma/                     # Prisma ORM 配置和迁移
│   ├── schema.prisma           # 数据库模型定义
│   └── dev.db                  # SQLite 数据库文件
├── package.json                # API 依赖配置
├── .env                        # 环境变量 (包含密钥，不提交)
├── .env.example                # 环境变量示例
│
├── auth/                       # 认证模块
│   ├── controller.ts           # 认证控制器
│   ├── middleware.ts           # 认证中间件
│   └── types.ts               # 类型定义
│
├── middleware/                 # Express 中间件
│   ├── auth.ts                # JWT 认证中间件
│   ├── apiKeyAuth.ts          # API Key 认证
│   └── errorHandler.ts        # 错误处理
│
├── settings/                   # 设置管理
│   └── routes.ts              # 设置 API 路由 (并发配置等)
│
├── skills/                     # 技能管理
│   ├── routes.ts               # 技能 API 路由
│   ├── SyncJobManager.ts       # 同步任务管理器
│   └── controller.ts           # 技能控制器
│
├── translation/                # 翻译工作器
│   ├── worker.ts              # 翻译后台任务
│   └── skillUtils.ts          # 翻译工具函数
│
├── users/                      # 用户管理
│   └── routes.ts              # 用户 API
│
├── types/                      # TypeScript 类型定义
├── utils/                      # 工具函数
├── uploads/                    # 上传文件目录
├── external_skills/            # 外部技能目录 (Git 克隆)
├── dist/                       # 编译后的 JavaScript
└── test/                       # 测试文件
```

**主要功能**:

- 技能 (Skills) 的注册、搜索、同步
- 用户认证 (JWT)
- 翻译后台任务处理
- 技能安全审计
- MCP 工具注册

---

### `frontend/` - Next.js 前端

下一代 Web 应用，提供技能管理和搜索界面。

```
frontend/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           # 首页
│   │   ├── layout.tsx        # 布局
│   │   ├── settings/         # 设置页面
│   │   │   └── page.tsx     # 设置页面 (并发配置等)
│   │   └── skills/           # 技能页面
│   │       └── index/        # 技能列表/搜索
│   │           └── page.tsx
│   ├── components/            # React 组件
│   ├── context/               # React Context
│   │   └── LanguageContext.tsx # 多语言上下文
│   ├── lib/                   # 工具库
│   │   └── api.ts            # API 调用封装
│   └── styles/               # 样式文件
├── public/                    # 静态资源
├── __tests__/                # 单元测试
├── e2e/                      # E2E 测试
├── package.json
├── next.config.ts
├── tsconfig.json
└── .env.local                # 本地环境变量
```

**主要功能**:

- 技能浏览和搜索
- 技能详情查看
- 设置管理
- 多语言支持

---

### `mcp-service/` - MCP 微服务

独立的 MCP (Model Context Protocol) 服务，端口 8003。

```
mcp-service/
├── src/
│   ├── index.ts              # 主入口
│   ├── server.ts             # MCP 服务器
│   ├── middleware/           # 中间件
│   │   ├── apiKeyAuth.ts    # API Key 认证
│   │   └── logger.ts        # 日志
│   └── tools/                # MCP 工具
│       ├── skill*.ts        # 技能相关工具
│       └── registry.ts       # 工具注册
├── dist/                     # 编译输出
└── package.json
```

**主要功能**:

- 提供 MCP 协议接口
- 允许 LLM 与本地技能交互

---

### `skills/` - 本地技能

存储本地开发的技能包。

```
skills/
├── README.md                 # 技能使用说明
├── modelscope-t2v/          # ModelScope 文字转视频技能
├── movie-diffusion/         # 视频生成技能
├── stable-video-diffusion/  # 稳定视频扩散技能
├── service/                 # 服务类技能
└── test-package-skill/      # 测试用技能包
```

---

### `tools/` - 工具脚本

各种命令行工具和脚本。

```
tools/
├── register_skills.py        # 技能注册脚本 (核心)
├── security_auditor.py       # 安全审计脚本
├── parallel_sync.py          # 并行同步脚本
├── sync_monitor.py           # 同步监控脚本
├── auto-importer.sh         # 自动导入脚本
├── auto_sync_repos.py       # 自动同步仓库
├── fetch_skills_sh_alltime.py # 抓取 skills.sh 数据
├── build_skill_index.py     # 构建搜索索引
├── fix_skill_paths.py       # 修复技能路径
├── debug_skill.py           # 调试技能
├── unify_to_zh.py           # 统一翻译为中文
├── import_installed_skills.py # 导入已安装技能
│
├── skill-loader-node/       # Node.js 技能加载器
│   ├── src/
│   │   └── loader.js        # 加载并验证技能 manifest
│   ├── examples/
│   │   └── load-skill.js    # 示例: 加载 GitHub 技能
│   ├── tests/
│   └── README.md
│
├── skill-loader-py/         # Python 技能加载器
│
├── skillshub/               # 语义搜索服务 (FastAPI + SBERT)
│   ├── service.py           # FastAPI 主服务
│   ├── build_index.py       # 索引构建脚本
│   ├── query_skillshub.py  # 查询脚本
│   ├── export_corpus.py     # 导出语料库
│   ├── corpus.json          # 技能语料库
│   ├── requirements.txt    # Python 依赖
│   ├── Dockerfile
│   ├── data/                # 索引数据
│   │   ├── skills.idx       # FAISS 索引
│   │   ├── skills_meta.json # 元数据
│   │   ├── skills_tfidf.*   # TF-IDF 向量
│   │   └── skills_sbert.*   # SBERT 向量
│   └── tests/
│
└── .assistant_registry.json  # 助手注册表
```

**主要功能**:

- `register_skills.py`: 从 GitHub 克隆技能仓库并注册到数据库
- `security_auditor.py`: 扫描技能代码中的安全风险
- `skillshub/`: 基于语义向量的技能搜索服务

---

### `external_skills/` - 外部技能

从 GitHub 克隆的外部技能仓库目录。每个子目录对应一个 skill 仓库。

---

### `docs/` - 项目文档

存放项目相关文档。

---

### `examples/` - 示例

示例代码和用法。

---

### `scripts/` - 脚本

辅助脚本。

---

### `spec/` - 规范文档

OpenAPI 规范和其他规范文档。

---

### `openspec/` - OpenSpec 工作流

实验性的 OpenSpec 变更工作流相关文件。

---

## 数据文件 (Data Files)

| 文件                          | 说明               |
| ----------------------------- | ------------------ |
| `skills_meta.json`            | 技能元数据 (JSON)  |
| `skills_index_meta.json`      | 搜索索引元数据     |
| `skills.idx`                  | FAISS 语义搜索索引 |
| `skills_tfidf.*`              | TF-IDF 向量文件    |
| `skills_sbert.*`              | SBERT 向量文件     |
| `skills_tfidf_vectorizer.pkl` | TF-IDF 向量化器    |
| `dump.sql`                    | 数据库 SQL 转储    |

---

## 日志文件 (Log Files)

| 文件                     | 说明             |
| ------------------------ | ---------------- |
| `api.log`                | API 服务器日志   |
| `worker.log`             | 后台任务日志     |
| `register_skills.log`    | 技能注册日志     |
| `sync_monitor.log`       | 同步监控日志     |
| `skillshub.log`          | 语义搜索服务日志 |
| `parallel_sync.log`      | 并行同步日志     |
| `auto-importer.log`      | 自动导入日志     |
| `translation_worker.log` | 翻译工作器日志   |
| `sync_failures.json`     | 同步失败记录     |

---

## 工作原理 (How It Works)

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面 (Frontend)                        │
│                   http://localhost:3000                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 服务器 (Port 8002)                       │
│                     Express + Prisma + SQLite                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Skills   │  │ Translation│  │ Settings │  │ Auth         │    │
│  │ Routes   │  │ Worker    │  │ Routes   │  │ Middleware   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ MCP Service   │   │ Skillshub     │   │ External      │
│ (Port 8003)  │   │ (Port 8001)   │   │ Skills        │
│               │   │               │   │ (Git Clone)   │
│ MCP Protocol  │   │ Semantic      │   │               │
│ for LLMs     │   │ Search        │   │               │
└───────────────┘   └───────┬───────┘   └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ SQLite DB     │
                    │ (dev.db)      │
                    └───────────────┘
```

---

## 快速启动 (Quick Start)

```bash
# 1. 初始化
./init.sh

# 2. 启动所有服务 (或分别启动)
docker-compose up -d

# 3. 访问
# Frontend: http://localhost:3000
# API: http://localhost:8002
# MCP: http://localhost:8003
# Skillshub: http://localhost:8001
```

---

## 技术栈 (Tech Stack)

| 组件        | 技术                                |
| ----------- | ----------------------------------- |
| Frontend    | Next.js 15+, React, TypeScript      |
| API         | Express, TypeScript, Prisma, SQLite |
| MCP Service | TypeScript, MCP Protocol            |
| Search      | FastAPI, SBERT, FAISS, TF-IDF       |
| Auth        | JWT                                 |
| Container   | Docker, Docker Compose              |

---

## 注意事项 (Notes)

- `.env` 文件包含敏感信息，已加入 `.gitignore`
- `external_skills/` 从远程克隆，不提交到 Git
- `*.db` 数据库文件不提交
- 日志文件不提交
- 索引文件 (`*.idx`, `*.npz`, `*.pkl`) 很大，通常不提交
