#!/bin/bash

# start_mcp.sh - Script to start the standalone MCP service

# Use default values or those provided in the environment
export MCP_PORT=${MCP_PORT:-8003}
export SKILLSHUB_BASE_URL=${SKILLSHUB_BASE_URL:-http://127.0.0.1:8001}

echo "=========================================================="
echo " Starting MCP Service (Standalone Microservice)           "
echo "=========================================================="
echo " - Port: $MCP_PORT"
echo " - Skillshub: $SKILLSHUB_BASE_URL"
echo " - Workspace: mcp-service"
echo "=========================================================="

# Check if node_modules exists, otherwise install dependencies
if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Running npm install..."
    npm install
fi

# Ensure the Prisma client is generated for the mcp-service workspace
# The 'dev' script in mcp-service/package.json already does this,
# but we'll run it here for clarity.
echo "Running prisma generate for mcp-service..."
npm run generate --workspace=mcp-service

# Start the service in development mode (with watch mode and ts-node/esm)
# Note: You can change 'dev' to 'start' if you prefer production mode (requires 'npm run build')
npm run dev --workspace=mcp-service
