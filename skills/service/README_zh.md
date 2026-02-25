# 技能服务（FastAPI）

此服务提供一个端点 `/generate/{skill_name}`，该端点会同步调用相应的技能包装器。此模板仅用于本地测试和演示；生产环境应使用异步作业队列 + 存储（S3）。

示例
-------
POST /generate/stable-video-diffusion
Body: { "prompt": "一只猫在飞", "num_frames": 14 }

响应: { "video_path": "/tmp/....mp4" }

本地运行：

1. python3 -m venv .venv && . .venv/bin/activate
2. pip install -r requirements.txt
3. uvicorn app:app --reload --port 8080