from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import yaml


def discover_manifest_file(skill_dir: str) -> Path | None:
    base = Path(skill_dir)
    for name in ("SKILL.md", "skill.json", "skill.yaml", "skill.yml", "package.json"):
        p = base / name
        if p.exists():
            return p
    return None


def load_manifest(skill_dir: str) -> tuple[dict, str]:
    p = discover_manifest_file(skill_dir)
    if not p:
        raise FileNotFoundError(f"No manifest found in {skill_dir}")

    raw = p.read_text(encoding="utf-8")
    if p.name == "SKILL.md":
        import re
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, flags=re.S)
        if m:
            return yaml.safe_load(m.group(1)) or {}, "SKILL.md"
        return {}, "SKILL.md"
    if p.name == "skill.json":
        return json.loads(raw), "skill.json"
    if p.name in ("skill.yaml", "skill.yml"):
        return yaml.safe_load(raw), p.name
    if p.name == "package.json":
        pkg = json.loads(raw)
        if "skill" not in pkg:
            raise ValueError('package.json found but missing top-level "skill" field')
        if not isinstance(pkg["skill"], dict):
            raise ValueError("package.json skill field must be an object")
        return pkg["skill"], "package.json#skill"

    raise ValueError(f"Unsupported manifest file: {p}")


def validate_manifest(manifest: dict) -> None:
    # SKILL.md based skills might not have schemaVersion or id or version or entry
    # They are more like reference documentation than executable packages
    if "name" not in manifest and "id" not in manifest:
         # Minimal validation: must have at least a name or we use folder name later
         pass


def build_registration_info(manifest: dict, skill_dir: str, *, runtime: str = "python") -> dict:
    entry = manifest.get("entry") or {}
    if runtime == "node":
        entry_path = entry.get("node") or entry.get("path")
    elif runtime == "python":
        entry_path = entry.get("python") or entry.get("path")
    else:
        entry_path = entry.get("path")

    return {
        "id": manifest.get("id"),
        "name": manifest.get("name"),
        "version": manifest.get("version"),
        "description": manifest.get("description"),
        "dir": str(Path(skill_dir).resolve()),
        "entry": {"runtime": runtime, "path": entry_path, "exports": entry.get("exports") or {}},
        "repository": manifest.get("repository"),
        "integrity": manifest.get("integrity"),
    }


@dataclass
class Registry:
    _by_id: dict

    @classmethod
    def create(cls) -> "Registry":
        return cls(_by_id={})

    def register(self, info: dict) -> dict:
        if not info.get("id"):
            raise ValueError("registry.register requires info.id")
        self._by_id[info["id"]] = info
        return info

    def get(self, skill_id: str) -> dict | None:
        return self._by_id.get(skill_id)

    def list(self) -> list[dict]:
        return list(self._by_id.values())


def load_and_register(*, skill_dir: str, registry: Registry, runtime: str = "python") -> dict:
    manifest, source = load_manifest(skill_dir)
    validate_manifest(manifest)
    info = build_registration_info(manifest, skill_dir, runtime=runtime)
    info["manifestSource"] = source
    return registry.register(info)
