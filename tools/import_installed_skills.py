#!/usr/bin/env python3
"""Import installed_skills.json into a simple assistant runtime registry.

This script reads external_skills/installed_skills.json and writes
tools/.assistant_registry.json with an "enabled" flag for each skill.

It does NOT execute any skill code.
"""
from __future__ import annotations

import json
from pathlib import Path


SRC = Path("external_skills/installed_skills.json")
DEST = Path("tools/.assistant_registry.json")


def main():
    if not SRC.exists():
        print(f"source not found: {SRC}")
        raise SystemExit(1)
    data = json.loads(SRC.read_text(encoding="utf-8"))
    registry = {}
    for k, v in data.items():
        entry = dict(v)
        # Do not auto-execute; only register metadata
        entry.setdefault("enabled", True)
        registry[k] = entry

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(registry, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"imported {len(registry)} skills into {DEST}")


if __name__ == "__main__":
    main()
