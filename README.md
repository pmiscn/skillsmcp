# skillsmcp

[English](./README.md) | [中文](./README_zh.md)

SkillShub (skillsmcp) — Local skill registry, semantic search service, and Model Context Protocol (MCP) gateway.

This repository provides a unified platform to discover, manage, and exercise local "skills" (code wrappers) and MCP tools. It features a high-performance dashboard, semantic search with SBERT, and a dedicated MCP microservice.

## Core Components

- **api** — Node/Express core API server (Prisma + SQLite). Manages skill metadata and system settings.
- **frontend** — Next.js 15+ dashboard. Features progressive loading for an "instant" UI experience.
- **mcp-service** — Standalone MCP microservice (Port 8003). Bridges local skills to the Model Context Protocol.
- **tools/skillshub** — FastAPI service (Port 8001) for semantic search over skill manifests using SBERT/FAISS.
- **tools/skill-loader-node** — Node-based utility for fetching and verifying skill manifests.

## Architecture

```
[MCP Clients] <───> [mcp-service (8003)] <───> [api (8002)] <───> [SQLite]
                                                 ^
[Browser] <───> [frontend (3000)] <──────────────┘
                    |
                    └─> [skillshub (8001)] <───> [SBERT/FAISS Index]
```

## Quick Start

### 1. Prerequisites

- **Node.js** v20+
- **Python** 3.10+
- **SQLite**

### 2. Initialization

Run the initialization script to install dependencies and set up the database:

```bash
./init.sh
```

### 3. Running Services

You can start components individually or use the provided scripts:

- **MCP Service**: `./start_mcp.sh` (Starts on port 8003)
- **Core API**: `npm run dev --workspace=api` (Starts on port 8002)
- **Frontend**: `npm run dev --workspace=frontend` (Starts on port 3000)
- **Skillshub**: See `tools/skillshub/README.md` for index building and startup.

## Key Features

- **Progressive Dashboard**: The `/skills/index` page renders immediately, loading data-heavy components asynchronously for a snappier feel.
- **MCP Integration**: Fully isolated MCP service allowing LLMs to interact with local skills via a standard protocol.
- **Smart Search**: Semantic search powered by SBERT with a TF-IDF fallback for robust skill discovery.
- **Flexible Configuration**:
  - **Proxy Support**: Configure independent proxies for translation engines and LLM audits via the UI.
  - **API Key Resolution**: Use plain-text keys or environment variable names (e.g., `OPENAI_API_KEY`) for secure credential management.

## Environment Configuration

Copy `api/.env.example` to `api/.env` (if provided) or configure the following:

- `DATABASE_URL`: `file:./dev.db`
- `JWT_SECRET`: Your secret key
- `SKILLSHUB_API_KEY`: For index management

## Security Notes

- Skills are executed in local or containerized environments. Ensure manifests are from trusted sources.
- The `mcp-service` and `skillshub` should be firewalled if exposed to public networks.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.
