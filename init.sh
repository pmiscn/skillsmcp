#!/bin/bash

# skillsmcp Initialization Script
# Automates the setup of Node.js dependencies, Python virtual environment, and Prisma database.

set -eo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting skillsmcp initialization...${NC}"

# 1. Environment Configuration
echo -e "\n${YELLOW}[1/4] Configuring Environment...${NC}"
if [ ! -f "api/.env" ]; then
    if [ -f "api/.env.example" ]; then
        echo "Creating api/.env from api/.env.example..."
        cp api/.env.example api/.env
    else
        echo -e "${RED}Error: api/.env.example not found.${NC}"
    fi
else
    echo "api/.env already exists, skipping."
fi

# 2. Install Node.js dependencies
echo -e "\n${YELLOW}[2/4] Installing Node.js dependencies...${NC}"
if command -v npm >/dev/null 2>&1; then
    npm install
else
    echo -e "${RED}Error: npm not found. Please install Node.js and npm.${NC}"
    exit 1
fi

# 3. Setup Python environment for skillshub (Optional but recommended)
echo -e "\n${YELLOW}[3/4] Setting up Python environment for skillshub...${NC}"
# Detect Python 3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD=python3
elif command -v python >/dev/null 2>&1 && python -c 'import sys; exit(0 if sys.version_info.major == 3 else 1)' >/dev/null 2>&1; then
    PYTHON_CMD=python
else
    PYTHON_CMD=""
fi

if [ -n "$PYTHON_CMD" ]; then
    if [ ! -d ".venv" ]; then
        echo "Creating Python virtual environment..."
        $PYTHON_CMD -m venv .venv
    fi
    
    source .venv/bin/activate
    echo "Installing Python dependencies (this may take a few minutes for sentence-transformers/faiss)..."
    pip install --upgrade pip
    pip install -r tools/skillshub/requirements.txt
else
    echo -e "${RED}Warning: Python 3 not found. Skipping skillshub setup.${NC}"
    echo "You will not be able to use semantic search until Python 3 and requirements are installed."
fi

# 4. Initialize Database (Prisma)
echo -e "\n${YELLOW}[4/4] Initializing Database...${NC}"
if [ -d "api" ]; then
    cd api
    echo "Generating Prisma Client..."
    npx prisma generate
    echo "Pushing database schema..."
    npx prisma db push
    echo "Seeding initial data..."
    npx prisma db seed
    cd ..
else
    echo -e "${RED}Error: api directory not found.${NC}"
    exit 1
fi

# 5. Generate Prisma client for MCP service
echo -e "\n${YELLOW}[Bonus] Preparing mcp-service...${NC}"
if [ -d "mcp-service" ]; then
    cd mcp-service
    npm run generate || echo "Skipping mcp-service generation (may require previous steps to complete)."
    cd ..
fi

echo -e "\n${GREEN}Initialization complete!${NC}"
echo -e "You can now start the services:"
echo -e "  - Core API: ${YELLOW}./start_api_server.sh${NC}"
echo -e "  - MCP Service: ${YELLOW}./start_mcp.sh${NC}"
echo -e "  - Frontend: ${YELLOW}./start_frontend.sh${NC}"
echo -e "  - Skillshub: ${YELLOW}./start_skillshub.sh${NC}"
echo -e "  - Build Index: ${YELLOW}./rebuild_index.sh${NC}"
