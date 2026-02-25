import sqlite3
from pathlib import Path
from typing import Dict

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"
FEED_ROOT = PROJECT_ROOT / "external_skills" / "neversight__skills.sh_feed__HEAD" / "data" / "skills-md"


def index_skill_md(root: Path) -> Dict[str, str]:
    """Index all SKILL.md files under external_skills once.

    Returns a mapping from skill directory name -> relative path (from PROJECT_ROOT) to SKILL.md
    If multiple SKILL.md share the same parent name, the first seen is kept.
    """
    index: Dict[str, str] = {}
    base = root / "external_skills"
    if not base.exists():
        return index

    for p in base.rglob("SKILL.md"):
        # parent name is the skill folder name
        skill_name = p.parent.name
        rel = str(p.relative_to(PROJECT_ROOT))
        if skill_name not in index:
            index[skill_name] = rel
    return index


def fix_paths():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    # Build index once
    print("Indexing SKILL.md files under external_skills (one-time)...")
    skill_index = index_skill_md(PROJECT_ROOT)
    print(f"  Indexed {len(skill_index)} skills.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT id, skill_path FROM Skill")
    skills = cursor.fetchall()

    updated_count = 0
    for skill_id, current_path in skills:
        if not current_path:
            continue

        abs_path = PROJECT_ROOT / current_path
        if abs_path.exists():
            continue

        print(f"Path not found for {skill_id}: {current_path}")

        # Try to find the correct path
        parts = skill_id.split("::")
        skill_name = parts[-1]
        found_path = None

        possible_rel_paths = []
        if len(parts) >= 2:
            owner = parts[0]
            repo = parts[1]
            possible_rel_paths.append(f"external_skills/{owner}__{repo}__HEAD/{skill_name}/SKILL.md")
            possible_rel_paths.append(f"external_skills/{owner}__{repo}__HEAD/skills/{skill_name}/SKILL.md")

        if len(parts) >= 3:
            if not FEED_ROOT.exists():
                print(f"  Aggregate feed root missing: {FEED_ROOT}")
            seen_feed = set()
            real_name = parts[-1]
            for idx in range(len(parts) - 2):
                provider = parts[idx]
                real_owner = parts[idx + 1]
                candidate = str(Path("external_skills")
                                / "neversight__skills.sh_feed__HEAD"
                                / "data"
                                / "skills-md"
                                / provider
                                / real_owner
                                / real_name
                                / "SKILL.md")
                if candidate in seen_feed:
                    continue
                seen_feed.add(candidate)
                possible_rel_paths.append(candidate)

        # First check the common candidate paths
        for rel in possible_rel_paths:
            candidate_path = PROJECT_ROOT / rel
            if candidate_path.exists():
                print(f"  Found candidate: {rel}")
                found_path = rel
                break
            print(f"  Missing candidate: {rel}")

        # Fallback: use prebuilt index instead of os.walk per-skill
        if not found_path:
            if skill_name in skill_index:
                found_path = skill_index[skill_name]
                print(f"  Found in index by name: {found_path}")
            else:
                # preserve sliding window matching behavior: try matching by parent name across index
                # (this simulates checking parent folder names quickly)
                for name, rel in skill_index.items():
                    if name == skill_name:
                        found_path = rel
                        print(f"  Found in index by exact parent match: {found_path}")
                        break

        if found_path:
            print(f"  Found correct path: {found_path}")
            cursor.execute("UPDATE Skill SET skill_path = ? WHERE id = ?", (found_path, skill_id))
            updated_count += 1
        else:
            print(f"  Could not find path for {skill_id}")

    conn.commit()
    conn.close()
    print(f"Updated {updated_count} skill paths.")


if __name__ == "__main__":
    fix_paths()
