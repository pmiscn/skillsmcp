#!/bin/bash
echo "Starting Backend Service (Python Skillshub)..."
# Path to virtual environment
VENV_PATH="/home/amu/projects/skillsmcp/.venv"

if [ -d "$VENV_PATH" ]; then
    source "$VENV_PATH/bin/activate"
    echo "Activated virtual environment (.venv)"
else
    echo "Virtual environment not found at $VENV_PATH. Please run setup first."
    exit 1
fi

# Configuration
export SKILLSHUB_API_KEY=${SKILLSHUB_API_KEY:-"local-dev-key-123"}
export SKILLSHUB_USE_GPU=1
export PYTHONUNBUFFERED=1

# Change to the directory of the script
cd "$(dirname "$0")"

#KR|# Start background build if requested or if index missing
#VH|# (This part was mentioned in the subagent's summary)
#if [ ! -f "skills.idx" ]; then
#BS|    echo "[SKILLSHUB] Index missing. Starting initial build from DB..."
#NM|    python build_index.py db > build_initial.log 2>&1 &
#fi
# Auto-build disabled - use manual build instead
# (This part was mentioned in the subagent's summary)
if [ ! -f "skills.idx" ]; then
    echo "[SKILLSHUB] Index missing. Starting initial build from DB..."
    python build_index.py db > build_initial.log 2>&1 &
fi

# Run the FastAPI service
exec uvicorn service:app --host 0.0.0.0 --port 8001
