import sqlite3
import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.absolute()
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"

def flush():
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT id, skill_path, content_i18n FROM Skill WHERE skill_path IS NOT NULL AND content_i18n IS NOT NULL;")
    rows = cursor.fetchall()
    
    count = 0
    for sid, rel_path, i18n_json in rows:
        try:
            data = json.loads(i18n_json)
            zh_content = data.get("zh")
            if not zh_content:
                continue
            
            # rel_path is usually something like external_skills/repo/skills/name/SKILL.md
            abs_path = PROJECT_ROOT / rel_path
            if not abs_path.exists():
                continue
            
            # We want to create SKILL_zh.md or README_zh.md
            dir_path = abs_path.parent
            file_name = abs_path.name
            if file_name.lower() == "skill.md":
                zh_file_name = "SKILL_zh.md"
            elif file_name.lower() == "readme.md":
                zh_file_name = "README_zh.md"
            else:
                base, ext = os.path.splitext(file_name)
                zh_file_name = f"{base}_zh{ext}"
            
            zh_path = dir_path / zh_file_name
            
            # Avoid overwriting if same? Actually overwrite is better to sync DB -> Disk
            with open(zh_path, "w", encoding="utf-8") as f:
                f.write(zh_content)
            count += 1
        except Exception as e:
            print(f"Error processing {sid}: {e}")
            
    print(f"Successfully flushed {count} translations to disk.")
    conn.close()

if __name__ == "__main__":
    flush()
