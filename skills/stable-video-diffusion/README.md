# StableVideoDiffusion Skill

Template wrapper for StableVideoDiffusion (image->video / text->video). Verify license (OpenRAIL-M) before commercial use.

Usage
----
1. Install system requirements and NVIDIA drivers.
2. Build Docker: docker build -t svd-skill:latest .
3. Run locally: docker run --gpus all -v /path/to/models:/root/.cache/huggingface -v /tmp:/tmp svd-skill:latest --image /tmp/input.png --out /tmp/out.mp4 --prompt "A cat flying"

Env
---
- SVD_MODEL_ID: HuggingFace model id (default stabilityai/stable-video-diffusion-img2vid-xt)

HTTP Contract (suggested)
-------------------------
POST /generate
Input JSON (via skills/service): { "prompt": "string", "num_frames": 14 }
Response: { "video_path": "/tmp/..../out.mp4" }

Example curl (using service):

curl -X POST "http://localhost:8080/generate/stable-video-diffusion" -H "Content-Type: application/json" -d '{"prompt":"A cat flying","num_frames":14}'
