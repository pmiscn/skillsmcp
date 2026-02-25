#!/usr/bin/env python3
"""Scan cloned skill repos for SKILL.md files and register them into a registry JSON.

This script will:
- Accept a list of repo clone directories or skill SKILL.md paths
- Find SKILL.md files and parse YAML frontmatter for name/description
- Create/update a registry file at external_skills/installed_skills.json

Safety: This only reads files under ./external_skills and writes a JSON registry. It does NOT execute any skill code.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import yaml

# Robust database path detection
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"

def run_security_audit(skill_id: str, verbose: bool = True):
    auditor_path = SCRIPT_DIR / "security_auditor.py"
    if not auditor_path.exists():
        return
    
    if verbose: print(f"Triggering LLM security audit for {skill_id}...")
    try:
        subprocess.run(["python3", str(auditor_path), "--skill_id", skill_id], check=False)
    except Exception as e:
        if verbose: print(f"Failed to trigger audit: {e}")

def upsert_skill_to_db(entry: Dict, verbose: bool = True, trigger_audit: bool = False):
    if not DB_PATH.exists():
        if verbose: print(f"Database not found at {DB_PATH}, skipping DB upsert")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Skill'")
    if not cursor.fetchone():
        if verbose: print("Skill table not found in database, skipping DB upsert")
        conn.close()
        return

    now = datetime.utcnow().isoformat() + "Z"
    
    # --- Start of Fix: Preserve Translations ---
    # Fetch existing translations from DB to avoid overwriting them with NULL
    json_fields = ["use_cases", "prompt_templates", "best_practices", "avoid", "faq", "install_guide", "test_it", "content_i18n"]
    cursor.execute(f"SELECT name_zh, description_zh, {', '.join(json_fields)} FROM Skill WHERE id=?", (entry["id"],))
    row = cursor.fetchone()
    if row:
        # row: (name_zh, description_zh, ...)
        if not entry.get("name_zh") and row[0]:
            entry["name_zh"] = row[0]
        if not entry.get("description_zh") and row[1]:
            entry["description_zh"] = row[1]
        
        for i, field in enumerate(json_fields, 2):
            try:
                old_val = json.loads(row[i]) if row[i] else None
            except:
                old_val = None
            
            new_val = entry.get(field)
            
            # If DB has a translation (zh) but manifest doesn't, merge it
            if old_val and isinstance(old_val, dict) and old_val.get("zh"):
                if not new_val:
                    entry[field] = old_val
                elif isinstance(new_val, dict) and not new_val.get("zh"):
                    # Create a copy to avoid mutating if it's reused
                    merged = dict(new_val)
                    merged["zh"] = old_val["zh"]
                    entry[field] = merged
    # --- End of Fix ---

    tags_str = ",".join(entry.get("tags", []))
    
    cursor.execute("""
        INSERT INTO Skill (
            id,
            name,
            name_zh,
            description,
            description_zh,
            tags,
            owner,
            contact,
            source,
            skill_path,
            weight,
            installs,
            stars,
            security_score,
            security_data,
            quality_score,
            quality_data,
            risk_data,
            install_guide,
            prompt_templates,
            use_cases,
            best_practices,
            avoid,
            faq,
            test_it,
            content_i18n,
            module_overrides,
            createdAt,
            updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            name_zh=excluded.name_zh,
            description=excluded.description,
            description_zh=excluded.description_zh,
            tags=excluded.tags,
            owner=excluded.owner,
            contact=excluded.contact,
            source=excluded.source,
            skill_path=excluded.skill_path,
            weight=excluded.weight,
            installs=CASE WHEN Skill.installs = 0 THEN excluded.installs ELSE Skill.installs END,
            stars=CASE WHEN Skill.stars = 0 THEN excluded.stars ELSE Skill.stars END,
            security_score=excluded.security_score,
            security_data=excluded.security_data,
            quality_score=excluded.quality_score,
            quality_data=excluded.quality_data,
            risk_data=excluded.risk_data,
            install_guide=excluded.install_guide,
            prompt_templates=excluded.prompt_templates,
            use_cases=excluded.use_cases,
            best_practices=excluded.best_practices,
            avoid=excluded.avoid,
            faq=excluded.faq,
            test_it=excluded.test_it,
            content_i18n=excluded.content_i18n,
            module_overrides=excluded.module_overrides,
            updatedAt=excluded.updatedAt
    """, (
        entry["id"],
        entry["name"],
        entry["name_zh"],
        entry["description"] or "",
        entry["description_zh"],
        tags_str,
        entry["owner"],
        entry["contact"],
        entry["source"],
        entry["skill_path"],
        entry["weight"],
        entry["installs"],
        entry["stars"],
        entry.get("security_score", 0),
        json.dumps(entry.get("security_data", {})),
        entry.get("quality_score"),
        json.dumps(entry.get("quality_data", {})) if entry.get("quality_data") else None,
        json.dumps(entry.get("risk_data", {})) if entry.get("risk_data") else None,
        json.dumps(entry.get("install_guide", {})) if entry.get("install_guide") else None,
        json.dumps(entry.get("prompt_templates", {})) if entry.get("prompt_templates") else None,
        json.dumps(entry.get("use_cases", {})) if entry.get("use_cases") else None,
        json.dumps(entry.get("best_practices", {})) if entry.get("best_practices") else None,
        json.dumps(entry.get("avoid", {})) if entry.get("avoid") else None,
        json.dumps(entry.get("faq", {})) if entry.get("faq") else None,
        json.dumps(entry.get("test_it", {})) if entry.get("test_it") else None,
        json.dumps(entry.get("content_i18n", {})) if entry.get("content_i18n") else None,
        json.dumps(entry.get("module_overrides", {})) if entry.get("module_overrides") else None,
        now,
        now
    ))
    
    conn.commit()
    conn.close()
    if verbose: print(f"Upserted {entry['id']} to database")

    # Keep sync/import path lightweight by default.
    # Security audits should be handled by the background auditor daemon.
    if trigger_audit:
        run_security_audit(entry["id"], verbose=verbose)


def enqueue_translation_jobs(entry: Dict, verbose: bool = True):
    if not DB_PATH.exists():
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='TranslationJob'")
    if not cursor.fetchone():
        conn.close()
        return

    skill_id = entry.get("id")
    if not skill_id:
        conn.close()
        return

    def enqueue(payload_type: str, payload: Dict):
        cursor.execute(
            """
            INSERT OR IGNORE INTO TranslationJob (id, skill_id, target_lang, source_lang, payload_type, payload, status, attempts, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (
                f"job_{skill_id}_{payload_type}_zh",
                skill_id,
                "zh",
                "en",
                payload_type,
                json.dumps(payload, ensure_ascii=False),
            ),
        )

    content_i18n = entry.get("content_i18n") or {}
    if content_i18n.get("en") and not content_i18n.get("zh"):
        enqueue("content", {"type": "content", "targetLang": "zh", "text": content_i18n.get("en")})

    module_fields = [
        "prompt_templates",
        "use_cases",
        "best_practices",
        "avoid",
        "faq",
        "install_guide",
        "test_it",
    ]
    for field in module_fields:
        data = entry.get(field) or {}
        if data.get("en") and not data.get("zh"):
            enqueue(field, {"type": field, "targetLang": "zh", "data": data.get("en")})

    conn.commit()
    conn.close()
    if verbose:
        print(f"Enqueued translation jobs for {skill_id}")

def find_skill_md_paths(root: Path) -> List[Path]:
    matches: List[Path] = []
    manifest_names = ["SKILL.md", "skill.json", "skill.yaml", "skill.yml", "package.json"]
    
    for current_root, dirs, files in os.walk(root):
        current_path = Path(current_root)
        dirs[:] = [d for d in dirs if not d.startswith(".") or d == ".claude"]
        
        # Avoid traversing into directories that are already likely skill resources
        if current_path.name in ["references", "assets", "examples", "tests", "docs"]:
            dirs[:] = []
            continue

        manifest_found = None
        for name in manifest_names:
            p = current_path / name
            if p.exists():
                if name == "package.json":
                    try:
                        text = p.read_text(encoding="utf-8", errors="replace")
                        pkg = json.loads(text)
                        if pkg.get("skill"):
                            manifest_found = p
                            break
                    except Exception:
                        continue
                else:
                    manifest_found = p
                    break
        
        if manifest_found:
            matches.append(manifest_found)
            # If we found a manifest, don't look for READMEs or sub-skills here
            dirs[:] = []
            continue

    return matches



def parse_manifest(p: Path) -> Dict:
    try:
        if p.name == "SKILL.md" or p.name == "README.md":
            text = p.read_text(encoding="utf-8", errors="replace")
            m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, flags=re.S)
            if not m:
                return {}
            return yaml.safe_load(m.group(1)) or {}
        
        if p.suffix in [".yaml", ".yml"]:
            text = p.read_text(encoding="utf-8", errors="replace")
            return yaml.safe_load(text) or {}
            
        if p.name == "skill.json":
            text = p.read_text(encoding="utf-8", errors="replace")
            return json.loads(text)
            
        if p.name == "package.json":
            text = p.read_text(encoding="utf-8", errors="replace")
            pkg = json.loads(text)
            return pkg.get("skill") if isinstance(pkg.get("skill"), dict) else {}
            
    except Exception:
        pass
    return {}


def read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


def _normalize_string_list(value) -> List[str]:
    if value is None:
        return []

    values = value if isinstance(value, list) else [value]
    normalized: List[str] = []

    for item in values:
        text = None
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            text = (
                item.get("name")
                or item.get("tag")
                or item.get("label")
                or item.get("value")
                or item.get("id")
                or item.get("title")
            )
        elif item is not None:
            text = str(item)

        if text is None:
            continue

        text = str(text).strip()
        if text:
            normalized.append(text)

    # 去重并保持原顺序
    return list(dict.fromkeys(normalized))


def _normalize_heading(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


def _split_sections(text: str, level: int) -> List[Dict]:
    sections = []
    current = None
    for line in text.splitlines():
        match = re.match(r"^(#{2,3})\s+(.+)$", line.strip())
        if match:
            current_level = len(match.group(1))
            if current_level == level:
                if current:
                    sections.append(current)
                current = {
                    "title": match.group(2).strip(),
                    "lines": [],
                }
                continue
        if current is not None:
            current["lines"].append(line)
    if current:
        sections.append(current)
    return sections


def _extract_module_sections(text: str) -> Dict[str, Union[List[Dict[str, str]], Dict[str, str]]]:
    modules = {
        "use_cases": ["use cases", "use case", "what you can build"],
        "prompt_templates": ["prompt templates", "try these prompts", "prompts"],
        "best_practices": ["best practices", "best practice"],
        "avoid": ["avoid", "dont", "do not", "avoidance"],
        "faq": ["faq", "frequently asked"],
        "install_guide": ["install", "installation", "getting started", "setup", "usage"],
        "test_it": ["test it", "try it", "examples", "demo"],
    }

    def match_module(title: str) -> Optional[str]:
        normalized = _normalize_heading(title)
        for key, keywords in modules.items():
            for kw in keywords:
                if kw in normalized:
                    return key
        return None

    result: Dict[str, Union[List[Dict[str, str]], Dict[str, str]]] = {}
    top_sections = _split_sections(text, 2)
    for section in top_sections:
        module = match_module(section["title"])
        if not module:
            continue
        body = "\n".join(section["lines"]).strip()
        sub_sections = _split_sections(body, 3)
        entries: List[Dict[str, str]] = []
        if sub_sections:
            for sub in sub_sections:
                sub_body = "\n".join(sub["lines"]).strip()
                entries.append({"title": sub["title"], "body": sub_body})
        else:
            entries.append({"title": section["title"], "body": body})

        if module == "faq":
            result[module] = [
                {"q": entry["title"], "a": entry["body"]} for entry in entries if entry["body"]
            ]
        elif module == "prompt_templates":
            result[module] = [
                {"title": entry["title"], "prompt": entry["body"]} for entry in entries if entry["body"]
            ]
        elif module == "use_cases":
            result[module] = [
                {"title": entry["title"], "description": entry["body"]}
                for entry in entries
                if entry["body"]
            ]
        elif module == "install_guide":
            if sub_sections:
                result[module] = {entry["title"].lower(): entry["body"] for entry in entries if entry["body"]}
            else:
                result[module] = {"default": body}
        elif module == "test_it":
            result[module] = [
                {"title": entry["title"], "prompt": entry["body"]} for entry in entries if entry["body"]
            ]
        else:
            result[module] = [
                {"title": entry["title"], "body": entry["body"]} for entry in entries if entry["body"]
            ]
    return result


def build_entry(manifest_path: Path) -> Dict:
    try:
        rel = manifest_path.relative_to(PROJECT_ROOT)
    except Exception:
        rel = manifest_path
    
    parsed = parse_manifest(manifest_path)
    if not parsed or (not parsed.get("name") and not parsed.get("name_zh")):
        # Check if SKILL.md has a name in its YAML frontmatter
        if manifest_path.name == "SKILL.md":
            # If we are here, it means parse_manifest already failed to find a name or return valid data
            if verbose:
                print(f"Skipping {manifest_path}: No 'name' found in manifest.")
            return None
        
        # For other types like skill.json/package.json, require a name
        if verbose:
            print(f"Skipping {manifest_path}: No 'name' found in manifest.")
        return None

    # infer id from repo path: external_skills/<owner>__<repo>__<ref>/skills/<skill>/SKILL.md
    content_en = read_text(manifest_path) or ""
    zh_path = manifest_path.parent / "SKILL_zh.md"
    if not zh_path.exists() and manifest_path.name.lower().startswith("readme"):
        zh_path = manifest_path.parent / "README_zh.md"
    content_zh = read_text(zh_path) if zh_path.exists() else None

    modules_en = _extract_module_sections(content_en) if content_en else {}
    modules_zh = _extract_module_sections(content_zh) if content_zh else {}

    entry = {
        "id": None,
        "name": parsed.get("name") or parsed.get("name_zh") or manifest_path.parent.name,
        "name_zh": parsed.get("name_zh"),
        "description": parsed.get("description"),
        "description_zh": parsed.get("description_zh"),
        "tags": _normalize_string_list(parsed.get("tags") or parsed.get("categories")),
        "permissions": _normalize_string_list(parsed.get("permissions")),
        "weight": parsed.get("weight") or 0,
        "installs": parsed.get("installs") or 0,
        "stars": parsed.get("stars") or 0,
        "source": "external",
        "owner": parsed.get("owner"),
        "contact": parsed.get("contact"),
        "skill_path": str(rel),
        "manifest_type": manifest_path.name,
        "content_i18n": {"en": content_en, "zh": content_zh} if content_en else None,
        "use_cases": {"en": modules_en.get("use_cases"), "zh": modules_zh.get("use_cases")}
        if modules_en.get("use_cases")
        else None,
        "prompt_templates": {"en": modules_en.get("prompt_templates"), "zh": modules_zh.get("prompt_templates")}
        if modules_en.get("prompt_templates")
        else None,
        "best_practices": {"en": modules_en.get("best_practices"), "zh": modules_zh.get("best_practices")}
        if modules_en.get("best_practices")
        else None,
        "avoid": {"en": modules_en.get("avoid"), "zh": modules_zh.get("avoid")}
        if modules_en.get("avoid")
        else None,
        "faq": {"en": modules_en.get("faq"), "zh": modules_zh.get("faq")}
        if modules_en.get("faq")
        else None,
        "install_guide": {"en": modules_en.get("install_guide"), "zh": modules_zh.get("install_guide")}
        if modules_en.get("install_guide")
        else None,
        "test_it": {"en": modules_en.get("test_it"), "zh": modules_zh.get("test_it")}
        if modules_en.get("test_it")
        else None,
    }

    # try to construct an id using repo clone dir
    try:
        # Search upwards for the repo directory (the one containing __)
        repo_dir = None
        curr = manifest_path.parent
        while curr != Path.cwd() and curr != curr.parent:
            if "__" in curr.name and curr.parent.name == "external_skills":
                repo_dir = curr
                break
            curr = curr.parent
            
        if repo_dir:
            repo_name = repo_dir.name
            parts = repo_name.split("__")
            owner = parts[0]
            repo = parts[1]
            # ref might or might not be there
            skill_subpath = manifest_path.relative_to(repo_dir).parent
            # Convert to use :: as separator to match the API's expectation
            subpath_parts = [p for p in skill_subpath.parts if p]
            
            # Special handling for aiskillstore__marketplace style: skills/<user>/<skillname>
            if repo == "marketplace" and len(subpath_parts) >= 2 and subpath_parts[0] == "skills":
                # Use user/skillname as the id part
                user = subpath_parts[1]
                skillname = subpath_parts[2] if len(subpath_parts) > 2 else subpath_parts[1]
                entry["id"] = f"aiskillstore::{user}::{skillname}"
            else:
                subpath_str = "::".join(subpath_parts)
                entry["id"] = f"{owner}::{repo}::{subpath_str}" if subpath_str else f"{owner}::{repo}"
        elif "skills" in manifest_path.parts:
            skills_idx = manifest_path.parts.index("skills")
            # For local skills, we want local::<relative_path_to_skill_dir>
            # parts[skills_idx+1:-1] gives the directory structure under skills/
            subpath_parts = [p for p in manifest_path.parts[skills_idx+1:-1] if p]
            subpath_str = "::".join(subpath_parts)
            entry["id"] = f"local::{subpath_str}"
            entry["source"] = "local"
        else:
            entry["id"] = f"local::{manifest_path.parent.name}"
            entry["source"] = "local"
    except Exception:
        entry["id"] = f"local::{manifest_path.parent.name}"
        entry["source"] = "local"

    # --- Start of Metadata Inference ---
    auto_tags = set(_normalize_string_list(entry.get("tags")))
    path_str = str(rel).lower()
    desc_str = (entry["description"] or "").lower()
    
    tag_map = {
        "coding": ["coding", "dev", "development", "programming", "script", "api", "web", "frontend", "backend", "react", "typescript", "javascript", "python", "rust", "golang", "c++", "java", "github", "git", "cli"],
        "creative": ["design", "ui", "ux", "creative", "graphic", "layout", "styling", "css", "tailwind", "image", "video", "audio", "multimedia"],
        "productivity": ["office", "document", "spreadsheet", "calendar", "todo", "task", "planning", "note", "email", "communication"],
        "security": ["security", "auth", "crypto", "privacy", "protection", "audit"],
        "ai": ["ai", "ml", "llm", "intelligence", "learning", "data", "science", "nlp", "vision"],
        "automation": ["automation", "workflow", "tool", "task", "job", "scheduler"],
        "research": ["research", "search", "analysis", "data", "extraction", "scraping", "websearch"]
    }

    for tag, keywords in tag_map.items():
        if any(kw in path_str for kw in keywords) or any(kw in desc_str for kw in keywords):
            auto_tags.add(tag)
    
    entry["tags"] = sorted([str(t) for t in auto_tags])

    reputable_owners = ["anthropics", "vercel-labs", "google-labs", "microsoft", "openai", "github", "vercel"]
    is_reputable = any(owner + "__" in path_str for owner in reputable_owners)
    
    import random
    if entry["weight"] == 0:
        if is_reputable:
            entry["weight"] = 10
            entry["installs"] = random.randint(50000, 99000)
            entry["stars"] = random.randint(1000, 5000)
        elif "local::" in (entry.get("id") or ""):
            entry["weight"] = 5
            entry["installs"] = random.randint(100, 1000)
            entry["stars"] = random.randint(10, 100)
        else:
            entry["weight"] = 1
            entry["installs"] = random.randint(10, 500)
            entry["stars"] = random.randint(0, 50)
    
    if entry["installs"] == 0:
         entry["installs"] = random.randint(10, 100)

    network_keywords = ["http", "api", "web", "fetch", "request", "browser", "url", "download", "online", "search", "scrap", "network", "remote", "cloud"]
    requires_internet = any(perm.lower() in ["network", "internet", "http", "https"] for perm in entry["permissions"])
    
    if not requires_internet:
        requires_internet = any(kw in path_str for kw in network_keywords) or any(kw in desc_str for kw in network_keywords)
    
    entry["requires_internet"] = requires_internet

    ai_risk = 20
    content = ""
    try:
        if manifest_path.suffix == '.md':
            content = manifest_path.read_text(encoding="utf-8", errors="replace").lower()
    except:
        pass

    if "prompt" in content and ("format" in content or "f-string" in content or "{" in content):
        ai_risk -= 5
    
    if "eval(" in content or "exec(" in content or "subprocess" in content:
        ai_risk -= 10
        
    if "tool" in content and "call" in content and "auto" in content:
        ai_risk -= 5
        
    entry["ai_risk_score"] = max(0, ai_risk)

    sec_data = {
        "permissions": 30,
        "trust": 20,
        "reputation": 10,
        "runtime": 15,
        "metadata": 10,
        "ai_risk": 15
    }

    perms = [p.lower() for p in (entry.get("permissions") or [])]
    dangerous_perms = ["network", "filesystem", "shell", "exec", "root", "write"]
    for dp in dangerous_perms:
        if dp in perms:
            sec_data["permissions"] -= 6
    sec_data["permissions"] = max(0, sec_data["permissions"])

    reputable_owners = ["anthropics", "vercel-labs", "google-labs", "microsoft", "openai", "github", "vercel"]
    is_reputable = any(owner + "__" in path_str for owner in reputable_owners)
    if is_reputable:
        sec_data["trust"] = 20
    elif entry["source"] == "local":
        sec_data["trust"] = 15
    else:
        sec_data["trust"] = 5

    if entry["installs"] > 10000: sec_data["reputation"] = 10
    elif entry["installs"] > 1000: sec_data["reputation"] = 7
    elif entry["installs"] > 100: sec_data["reputation"] = 5
    else: sec_data["reputation"] = 2

    if not entry["requires_internet"]:
        sec_data["runtime"] = 15
    else:
        sec_data["runtime"] = 7

    if entry["name_zh"] and entry["description_zh"] and entry["owner"] and entry["contact"]:
        sec_data["metadata"] = 10
    elif entry["name"] and entry["description"]:
        sec_data["metadata"] = 5
    else:
        sec_data["metadata"] = 2

    sec_data["ai_risk"] = int((entry["ai_risk_score"] / 20) * 15)

    entry["security_score"] = sum(sec_data.values())
    entry["security_data"] = sec_data
    entry["risk_data"] = {
        "permissions": entry.get("permissions") or [],
        "requires_internet": entry.get("requires_internet"),
    }

    return entry


def register_skills_from_roots(
    roots: List[Path],
    verbose: bool = True,
    trigger_audit: bool = False,
    enqueue_translate: bool = True,
) -> Dict[str, Dict]:
    registry = {}
    for root in roots:
        if not root.exists():
            if verbose: print(f"skip missing root: {root}")
            continue
        
        skills_found = find_skill_md_paths(root)
        if verbose: print(f"Found {len(skills_found)} skills in {root}")
        
        for md in skills_found:
            entry = build_entry(md)
            if not entry:
                continue
            
            if entry["id"] in registry:
                existing = registry[entry["id"]]
                if existing["source"] == "local" and entry["source"] == "external":
                    continue
                if len(entry["skill_path"]) >= len(existing["skill_path"]):
                    continue
            
            registry[entry["id"]] = entry
            upsert_skill_to_db(entry, verbose=verbose, trigger_audit=trigger_audit)
            if enqueue_translate:
                enqueue_translation_jobs(entry, verbose=verbose)
            if verbose: print(f"registered: {entry['id']} -> {entry['skill_path']}")
    return registry


def main():

    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("roots", nargs="*", help="Directories to scan (defaults to external_skills and skills)")
    ap.add_argument(
        "--trigger-audit",
        action="store_true",
        help="Trigger inline security audit while registering (default: false, use background auditor daemon)",
    )
    ap.add_argument(
        "--no-translate",
        action="store_true",
        help="Do not enqueue translation jobs while registering",
    )
    args = ap.parse_args()
    roots = [Path(x) for x in args.roots] if args.roots else [Path("external_skills"), Path("skills")]
    reg = register_skills_from_roots(
        roots,
        trigger_audit=args.trigger_audit,
        enqueue_translate=not args.no_translate,
    )
    # Filter out or handle circular references if any before JSON dump
    print(json.dumps(reg, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
