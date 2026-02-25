# 电影扩散技能

腾讯ARC 电影扩散（文本->视频）的模板包装。Apache-2.0 许可证。

用法
----
- 构建 Docker: docker build -t movie-diffusion-skill:latest .
- 运行（示例）: docker run --gpus all -v /tmp:/tmp movie-diffusion-skill:latest --prompt "一只狗在海滩上奔跑" --out /tmp/out.mp4

HTTP 协议（建议）
POST /generate
输入 JSON（通过 skills/service）: { "prompt": "字符串", "num_frames": 16 }
响应: { "video_path": "/tmp/..../out.mp4" }

示例 curl（使用服务）:

curl -X POST "http://localhost:8080/generate/movie-diffusion" -H "Content-Type: application/json" -d '{"prompt":"一只狗在海滩上奔跑","num_frames":16}'