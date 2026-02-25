Skillshub
============

Lightweight semantic search microservice for SKILL.md / skill manifests.

Features (POC):
- Build embeddings from a corpus JSON (/tmp/skillshub_corpus.json)
- Local FAISS index for semantic search
- FastAPI HTTP endpoints: /search, /skills/{id}, /index (rebuild)

Additional files added in POC:
- tools/skillshub/verify_registry.py (verify downloaded package tarballs)
- tools/skillshub/tests/test_build_index.py (unit test for build_index)

Security & Safety
- Indexing treats manifests as data only. The service will never execute skill code.
- Re-index endpoint is protected by an API key (ENV SKILLSHUB_API_KEY).

Quickstart (dev)
1. Create a virtualenv and install requirements:
   python -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
2. Ensure corpus is at /tmp/skillshub_corpus.json (created by the loader).
3. Build index:
   python build_index.py /tmp/skillshub_corpus.json
4. Run service:
   uvicorn service:app --reload --host 127.0.0.1 --port 8001
