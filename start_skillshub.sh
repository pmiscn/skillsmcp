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

# 启动服务
uvicorn tools.skillshub.service:app --host 0.0.0.0 --port 8001
