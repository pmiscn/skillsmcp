import os
from pathlib import Path

def unify_naming(root_dir):
    root = Path(root_dir)
    if not root.exists():
        return

    print(f"Scanning {root} for _cn files...")
    count = 0
    for path in root.glob("**/*"):
        if path.is_file():
            name = path.name
            new_name = None
            
            # Handle various common patterns
            if "_cn." in name.lower():
                # Case insensitive replace for the prefix part but keep extension
                import re
                new_name = re.sub(r"_cn\.", "_zh.", name, flags=re.IGNORECASE)
            elif name.lower().endswith("_cn"):
                new_name = name[:-3] + "_zh"
            
            if new_name and new_name != name:
                new_path = path.parent / new_name
                
                if new_path.exists():
                    print(f"Skipping {path.name} -> {new_name} (exists)")
                    continue
                    
                print(f"Renaming: {path.relative_to(root)} -> {new_name}")
                try:
                    path.rename(new_path)
                    count += 1
                except Exception as e:
                    print(f"Error renaming {path}: {e}")

            
    print(f"Finished {root_dir}. Renamed {count} files.")

if __name__ == "__main__":
    dirs_to_scan = ["skills", "external_skills", "external-skills"]
    for d in dirs_to_scan:
        unify_naming(d)
