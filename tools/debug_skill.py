import sqlite3
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"

def debug_skill(skill_id):
    print(f"Debugging skill: {skill_id}")
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT id, skill_path FROM Skill WHERE id = ?", (skill_id,))
    row = cursor.fetchone()
    
    if row:
        print(f"DB Entry: ID={row[0]}, path={row[1]}")
        if row[1]:
            abs_path = PROJECT_ROOT / row[1]
            print(f"Absolute path: {abs_path}")
            print(f"Exists: {abs_path.exists()}")
    else:
        print("Skill not found in database.")

    skill_name = skill_id.split("::")[-1]
    print(f"Searching for SKILL.md for '{skill_name}' in external_skills...")
    
    found = []
    for root, dirs, files in os.walk(PROJECT_ROOT / "external_skills"):
        if "SKILL.md" in files:
            p = Path(root) / "SKILL.md"
            if p.parent.name == skill_name:
                found.append(str(p.relative_to(PROJECT_ROOT)))
                
    if found:
        print(f"Found matches: {found}")
    else:
        print("No matches found in external_skills.")
        
    conn.close()

if __name__ == "__main__":
    debug_skill("github::awesome-copilot::skills::vscode-ext-localization")
    debug_skill("anthropics::claude-code::plugins::frontend-design::skills::frontend-design")
