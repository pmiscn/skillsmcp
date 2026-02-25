#!/usr/bin/env python3
import os
import sqlite3
import shutil
from pathlib import Path

# Constants
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"

def rename_cn_to_zh():
    print(f"Scanning for _cn files in {PROJECT_ROOT}...")
    count = 0
    # Common extensions for translated artifacts
    suffixes = [".txt", ".md", ".js", ".ts", ".py"]
    
    # Exclude node_modules, .git, .venv
    exclude_dirs = {"node_modules", ".git", ".venv", "__pycache__"}
    
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            path = Path(root) / file
            # Match _cn.suffix or _CN.suffix
            if "_cn." in file.lower():
                # Extract basename and ext
                stem = path.stem
                suffix = path.suffix
                if stem.lower().endswith("_cn") and suffix.lower() in suffixes:
                    new_stem = stem[:-3] + "_zh"
                    new_path = path.with_name(new_stem + suffix)
                    
                    if not new_path.exists():
                        print(f"Renaming: {path.relative_to(PROJECT_ROOT)} -> {new_path.name}")
                        shutil.move(path, new_path)
                        count += 1
                    else:
                        print(f"Skipping: {path.relative_to(PROJECT_ROOT)} (already exists: {new_path.name})")

    print(f"Renamed {count} files.")

def update_db():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Update TranslationJob target_lang
        cursor.execute("UPDATE TranslationJob SET target_lang = 'zh' WHERE target_lang = 'cn'")
        print(f"Updated {cursor.rowcount} TranslationJob entries.")
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database update failed: {e}")

if __name__ == "__main__":
    rename_cn_to_zh()
    update_db()
