# StableVideoDiffusion 技能

StableVideoDiffusion（图像->视频 / 文本->视频）的模板包装。在商业使用前请验证许可证（OpenRAIL-M）。

用法
----
1. 安装系统要求和 NVIDIA 驱动程序。
2. 构建 Docker：docker build -t svd-skill:latest .
3. 本地运行：docker run --gpus all -v /path/to/models:/root/.cache/huggingface -v /tmp:/tmp svd-skill:latest --image /tmp/input.png --out /tmp/out.mp4 --prompt "一只猫在飞"

环境
---
- SVD_MODEL_ID: HuggingFace 模型 ID（默认为 stabilityai/stable-video-diffusion-img2vid-xt）

HTTP 协议（建议）
-------------------------
POST /generate
输入 JSON（通过 skills/service）：{ "prompt": "字符串", "num_frames": 14 }
响应：{ "video_path": "/tmp/..../out.mp4" }

示例 curl（使用服务）：

curl -X POST "http://localhost:8080/generate/stable-video-diffusion" -H "Content-Type: application/json" -d '{"prompt":"一只猫在飞","num_frames":14}'