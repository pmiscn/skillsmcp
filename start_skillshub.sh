#!/bin/bash
# 启动 Python 后端服务 (Skillshub)
echo "Starting Backend Service (Python Skillshub)..."
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "Activated virtual environment (.venv)"
else
    echo "Warning: .venv not found. Please create it first."
    exit 1
fi

# Ensure SKILLSHUB_API_KEY is set for protected endpoints (default local dev key)
export SKILLSHUB_API_KEY=${SKILLSHUB_API_KEY:-local-dev-key-123}
export SKILLSHUB_USE_GPU=1

# Build index from DB in background so service starts with latest index (non-blocking)
echo "Starting background index build from DB..."
python tools/skillshub/build_index.py db &

# Start the FastAPI service
uvicorn tools.skillshub.service:app --host 0.0.0.0 --port 8001
