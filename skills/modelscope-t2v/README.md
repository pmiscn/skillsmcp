# ModelScope DAMO Text-to-Video Skill

Template wrapper for ModelScope DAMO text-to-video model. Apache-2.0 license.

Usage
----
- Build Docker: docker build -t modelscope-t2v-skill:latest .
- Run (example): docker run --gpus all -v /tmp:/tmp modelscope-t2v-skill:latest --prompt "A panda eating bamboo" --out /tmp/out.mp4

HTTP Contract (suggested)
POST /generate
Input JSON (via skills/service): { "prompt": "string" }
Response: { "video_path": "/tmp/..../out.mp4" }

Example curl (using service):

curl -X POST "http://localhost:8080/generate/modelscope-t2v" -H "Content-Type: application/json" -d '{"prompt":"A panda eating bamboo"}'
