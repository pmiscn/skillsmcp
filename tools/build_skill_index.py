#!/usr/bin/env python3
import os
import json
from pathlib import Path

ROOT = Path('external_skills')
OUT = Path('tools/skill_index.json')

def excerpt_text(p: Path, n=500):
    try:
        t = p.read_text(encoding='utf-8', errors='ignore')
        return t.strip()[:n].replace('\r', '\n')
    except Exception:
        return ''

def main():
    index = []
    if not ROOT.exists():
        print(f"Warning: {ROOT} does not exist. No index created.")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2))
        return

    for repo_dir in sorted(ROOT.iterdir()):
        if not repo_dir.is_dir():
            continue
        # Find SKILL.md files
        for md in repo_dir.rglob('SKILL.md'):
            index.append({
                'repo_dir': str(repo_dir),
                'path': str(md),
                'relpath': str(md.relative_to(repo_dir)),
                'type': 'SKILL.md',
                'excerpt': excerpt_text(md, 500)
            })
        # Find skill.json
        for mf in repo_dir.rglob('skill.json'):
            index.append({
                'repo_dir': str(repo_dir),
                'path': str(mf),
                'relpath': str(mf.relative_to(repo_dir)),
                'type': 'skill.json',
                'excerpt': excerpt_text(mf, 500)
            })
        # Find package.json and include only if it mentions "skill"
        for mf in repo_dir.rglob('package.json'):
            txt = excerpt_text(mf, 2000)
            excerpt = txt if '"skill"' in txt or '"skills"' in txt else ''
            index.append({
                'repo_dir': str(repo_dir),
                'path': str(mf),
                'relpath': str(mf.relative_to(repo_dir)),
                'type': 'package.json',
                'excerpt': excerpt
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2))
    print(f'Wrote {len(index)} entries to {OUT}')

if __name__ == '__main__':
    main()
