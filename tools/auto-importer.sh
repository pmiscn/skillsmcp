#!/bin/bash
while true; do
  echo "[Auto-Importer] Starting registration at $(date)"
  /home/amu/projects/skillsmcp/.venv/bin/python tools/register_skills.py
  echo "[Auto-Importer] Registration complete at $(date). Exporting corpus from DB..."
  /home/amu/projects/skillsmcp/.venv/bin/python tools/skillshub/export_corpus.py
  echo "[Auto-Importer] Corpus exported. Requesting index rebuild..."
  curl -X POST -H "X-API-KEY: local-dev-key-123" -H "Content-Type: application/json" -d '{"corpus_path": "/tmp/skillshub_corpus.json"}' http://127.0.0.1:8001/index/rebuild
  echo "[Auto-Importer] Waiting 300 seconds for more downloads..."
  sleep 300
done
