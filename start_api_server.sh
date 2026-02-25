#!/bin/bash
echo "Starting API Service (Node.js on Port 8002)..."

if [ ! -d "node_modules" ]; then
    echo "Error: node_modules not found. Running npm install..."
    npm install
fi

HOST=0.0.0.0 npm run dev --workspace=api
