#!/usr/bin/env python3
"""
Monitor long-running sync: every 5 minutes run register_skills and rebuild index,
stop when skill count >= 40000 or when main sync job completes.

Logs progress to sync_monitor.log and writes PID to sync_monitor.pid when started.
"""
import os
import time
import subprocess
import sys
from datetime import datetime

SYNC_JOB_ID = '49510f2b-29ee-45f0-bc62-d1f503ce5ba8'
CHECK_INTERVAL = 5 * 60  # 5 minutes
ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtbTJvNmpmbzAwMDB1ZmN0OTBjbWNiNmYiLCJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwic2VhcmNoX2VuZ2luZSI6ImF1dG8iLCJpYXQiOjE3NzIwNjc3OTIsImV4cCI6MTc3MjE1NDE5Mn0.swxKYPy60qAF8G8nnHY3dX-MrP80GJ6WPDtUFLexCkM'
LOG_FILE = 'sync_monitor.log'
PID_FILE = 'sync_monitor.pid'


def log(msg):
    ts = datetime.utcnow().isoformat() + 'Z'
    line = f"{ts} {msg}\n"
    with open(LOG_FILE, 'a') as f:
        f.write(line)
    print(line, end='')


def run_register():
    cmd = ['./.venv/bin/python3', 'tools/register_skills.py', '--no-translate']
    try:
        res = subprocess.run(cmd, check=False, capture_output=True, text=True)
        ok = res.returncode == 0
        log(f"register_skills exit={res.returncode}; stdout_len={len(res.stdout)}; stderr_len={len(res.stderr)}")
        return ok
    except Exception as e:
        log(f"register exception: {e}")
        return False


def rebuild_index():
    url = 'http://127.0.0.1:8002/api/skills/index/rebuild'
    headers = ['-H', f'"Authorization: Bearer {ADMIN_TOKEN}"']
    cmd = ['curl', '-sS', '-X', 'POST', url, '-H', f'Authorization: Bearer {ADMIN_TOKEN}']
    try:
        res = subprocess.run(cmd, check=False, capture_output=True, text=True)
        log(f"rebuild_index exit={res.returncode}; out={res.stdout.strip()[:400]}; err={res.stderr.strip()[:400]}")
        return res.returncode == 0
    except Exception as e:
        log(f"rebuild exception: {e}")
        return False


def get_skill_count():
    # Attempt to query API for total skills; fallback to /api/skills?limit=0
    url = 'http://127.0.0.1:8002/api/skills?limit=1&offset=0'
    cmd = ['curl', '-sS', '-H', f'Authorization: Bearer {ADMIN_TOKEN}', url]
    try:
        res = subprocess.run(cmd, check=False, capture_output=True, text=True)
        out = res.stdout
        # naive parse: look for "total":NUMBER
        import re
        m = re.search(r'"total"\s*:\s*(\d+)', out)
        if m:
            return int(m.group(1))
    except Exception as e:
        log(f"get_skill_count exception: {e}")
    return None


def check_sync_complete():
    # Query sync status endpoint if available
    url = 'http://127.0.0.1:8002/api/skills/sync/' + SYNC_JOB_ID + '/status'
    cmd = ['curl', '-sS', '-H', f'Authorization: Bearer {ADMIN_TOKEN}', url]
    try:
        res = subprocess.run(cmd, check=False, capture_output=True, text=True)
        out = res.stdout
        if 'completed' in out.lower():
            return True
    except Exception as e:
        log(f"check_sync_complete exception: {e}")
    return False


def main():
    # write pid
    pid = os.getpid()
    with open(PID_FILE, 'w') as f:
        f.write(str(pid))
    log(f"started sync_monitor pid={pid}")

    while True:
        # run register
        log('running register_skills')
        run_register()
        # rebuild index
        log('triggering index rebuild')
        rebuild_index()

        # get count
        count = get_skill_count()
        log(f'skill_count={count}')

        # check stop conditions
        if count is not None and count >= 40000:
            log(f'count >= 40000 ({count}); stopping')
            break
        if check_sync_complete():
            log('main sync job completed; stopping')
            break

        log(f'sleeping {CHECK_INTERVAL} seconds')
        time.sleep(CHECK_INTERVAL)

    log('exiting sync_monitor')


if __name__ == '__main__':
    main()
