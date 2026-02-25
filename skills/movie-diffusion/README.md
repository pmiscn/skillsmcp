# MovieDiffusion Skill

Template wrapper for TencentARC MovieDiffusion (text->video). Apache-2.0 license.

Usage
----
- Build Docker: docker build -t movie-diffusion-skill:latest .
- Run (example): docker run --gpus all -v /tmp:/tmp movie-diffusion-skill:latest --prompt "A dog running on the beach" --out /tmp/out.mp4

HTTP Contract (suggested)
POST /generate
Input JSON (via skills/service): { "prompt": "string", "num_frames": 16 }
Response: { "video_path": "/tmp/..../out.mp4" }

Example curl (using service):

curl -X POST "http://localhost:8080/generate/movie-diffusion" -H "Content-Type: application/json" -d '{"prompt":"A dog running on the beach","num_frames":16}'
