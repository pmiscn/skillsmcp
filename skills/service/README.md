# Skills Service (FastAPI)

This service exposes an endpoint `/generate/{skill_name}` that invokes the corresponding skill wrapper synchronously. It's a template for local testing and demo only; production should use async job queue + storage (S3).

Example
-------
POST /generate/stable-video-diffusion
Body: { "prompt": "A cat flying", "num_frames": 14 }

Response: { "video_path": "/tmp/....mp4" }

Run locally:

1. python3 -m venv .venv && . .venv/bin/activate
2. pip install -r requirements.txt
3. uvicorn app:app --reload --port 8080
