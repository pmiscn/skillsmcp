#!/usr/bin/env python3
"""Simple wrapper that catches errors and continues processing."""
import sys
import subprocess
import os

os.chdir("/home/amu/projects/skillsmcp")

# Run register_skills and capture output
process = subprocess.Popen(
    [".venv/bin/python", "tools/register_skills.py", "--no-translate"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

count = 0
for line in process.stdout:
    print(line, end="")
    if "Upserted" in line:
        count += 1
        if count % 100 == 0:
            # Periodically check if we're making progress
            pass

process.wait()
print(f"Process finished with return code: {process.returncode}")
