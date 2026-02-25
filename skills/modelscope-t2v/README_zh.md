# ModelScope DAMO 文本到视频技能

ModelScope DAMO 文本到视频模型的模板包装。Apache-2.0 许可证。

用法
----
- 构建 Docker: docker build -t modelscope-t2v-skill:latest .
- 运行（示例）: docker run --gpus all -v /tmp:/tmp modelscope-t2v-skill:latest --prompt "一只熊猫在吃竹子" --out /tmp/out.mp4

HTTP 协议（建议）
POST /generate
输入 JSON（通过 skills/service）: { "prompt": "string" }
响应: { "video_path": "/tmp/..../out.mp4" }

示例 curl（使用服务）:

curl -X POST "http://localhost:8080/generate/modelscope-t2v" -H "Content-Type: application/json" -d '{"prompt":"一只熊猫在吃竹子"}'