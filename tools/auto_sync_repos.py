import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
EXTERNAL_SKILLS = PROJECT_ROOT / "external_skills"
REPOS = [
    "https://github.com/ComposioHQ/awesome-claude-skills",
    "https://github.com/anthropics/skills",
    "https://github.com/aiskillstore/marketplace"
]

def run_command(args, cwd=None):
    print(f"Running: {' '.join(args)}")
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
    return result

def sync():
    # Ensure external_skills exists
    EXTERNAL_SKILLS.mkdir(exist_ok=True)
    
    loader_script = PROJECT_ROOT / "tools/skill-loader-node/examples/load-skill.js"
    register_script = PROJECT_ROOT / "tools/register_skills.py"
    venv_python = PROJECT_ROOT / ".venv/bin/python3"

    for repo_url in REPOS:
        # Extract owner/repo
        parts = repo_url.strip("/").split("/")
        owner = parts[-2]
        repo = parts[-1]
        
        print(f"\nSyncing {owner}/{repo}...")
        
        # Load skill (clones/updates)
        run_command([
            "node", str(loader_script),
            "--owner", owner,
            "--repo", repo,
            "--skills-dir", str(EXTERNAL_SKILLS)
        ])

    # Register all skills
    print("\nRegistering skills...")
    run_command([str(venv_python), str(register_script)])

if __name__ == "__main__":
    sync()
