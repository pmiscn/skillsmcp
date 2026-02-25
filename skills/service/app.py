#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import uuid
import os
from typing import Optional

app = FastAPI(title='CleanBooks Video Skills Service')

SKILL_DIR = os.path.join(os.path.dirname(__file__), '..')


class GenerateRequest(BaseModel):
    prompt: Optional[str] = None
    image_base64: Optional[str] = None
    num_frames: Optional[int] = 14
    seed: Optional[int] = 42


@app.post('/generate/{skill_name}')
async def generate(skill_name: str, req: GenerateRequest):
    """Synchronous wrapper that invokes the skill's wrapper.py script.

    This template runs the local wrapper synchronously. In production you
    should run inference asynchronously and return a job id.
    """
    skill_path = os.path.join(os.path.dirname(__file__), skill_name)
    if not os.path.isdir(skill_path):
        raise HTTPException(status_code=404, detail='Skill not found')

    out_path = f'/tmp/{uuid.uuid4().hex}.mp4'
    wrapper = os.path.join(skill_path, 'wrapper.py')
    if not os.path.isfile(wrapper):
        raise HTTPException(status_code=500, detail='Skill wrapper missing')

    cmd = ['python3', wrapper]
    if req.prompt:
        cmd += ['--prompt', req.prompt]
    cmd += ['--out', out_path]
    if req.num_frames:
        cmd += ['--frames', str(req.num_frames)]
    if req.seed:
        cmd += ['--seed', str(req.seed)]

    # Pre-execute: query local skillshub for candidate skills and prompt for confirmation (dry-run)
    try:
        import requests
        from urllib.parse import quote_plus
        search_q = req.prompt or skill_name
        resp = requests.get(f'http://127.0.0.1:8001/search?q={quote_plus(search_q)}&k=5', timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            # Present candidates to operator via logs (in real UI, surface these)
            print('Skillshub candidates for query:', search_q)
            for r in data.get('results', []):
                print(f"- {r.get('id')} ({r.get('score'):.4f}): {r.get('snippet')}")
            # For dry-run safety, do NOT auto-execute. Require explicit env override to proceed.
            if os.environ.get('SKILLSHUB_ALLOW_EXEC') != '1':
                raise HTTPException(status_code=412, detail='Execution blocked by skillshub dry-run. Set SKILLSHUB_ALLOW_EXEC=1 to allow.')
    except HTTPException:
        # re-raise HTTP errors
        raise
    except Exception:
        # If skillshub not reachable or fails, default to blocking execution to be safe
        raise HTTPException(status_code=503, detail='Skillshub query failed; execution blocked')

    # run wrapper (blocking) - placeholder
    proc = subprocess.run(cmd)
    if proc.returncode != 0 or not os.path.exists(out_path):
        raise HTTPException(status_code=500, detail='Skill execution failed')

    return { 'video_path': out_path }
