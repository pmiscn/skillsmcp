import os
import requests
import json
import subprocess
import concurrent.futures
from pathlib import Path

# --- Configuration ---
SKILLSHUB_API_ALL_TIME = "https://skills.sh/api/skills/all-time/"
LOADER_SCRIPT = "tools/skill-loader-node/examples/load-skill.js"
EXTERNAL_SKILLS_DIR = "external_skills"
MAX_WORKERS = 10
MAX_PAGES = 500  # As seen in the logs, it collected up to 376 pages

# Ensure directory exists
Path(EXTERNAL_SKILLS_DIR).mkdir(exist_ok=True)

def fetch_repo_list():
    print("Collecting repository list from skills.sh...")
    all_repos = set()
    page = 1
    has_more = True
    
    while has_more and page <= MAX_PAGES:
        url = f"{SKILLSHUB_API_ALL_TIME}{page}"
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code != 200:
                print(f"Failed to fetch page {page}: {resp.status_code}")
                break
                
            data = resp.json()
            skills = data.get("skills", [])
            if not skills:
                break
                
            for s in skills:
                repo = s.get("source") or s.get("topSource")
                if isinstance(repo, str) and "/" in repo:
                    all_repos.add(repo)
            
            if page % 1 == 0:
                print(f"Fetching page {page}...")
                print(f"Collected {len(all_repos)} repos from {page} pages...")
            
            has_more = data.get("hasMore", False)
            page += 1
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break
            
    print(f"Total unique repositories found: {len(all_repos)}")
    return list(all_repos)

def download_repo(repo_path):
    owner, repo = repo_path.split("/")
    repo_dir_name = f"{owner}__{repo}__HEAD" # load-skill.js uses __HEAD by default
    dest_path = Path(EXTERNAL_SKILLS_DIR) / repo_dir_name
    
    if dest_path.exists() and dest_path.is_dir():
        # Already exists, skip
        return f"SKIP: {repo_path}"
    
    cmd = [
        "node",
        LOADER_SCRIPT,
        "--owner", owner,
        "--repo", repo,
        "--skills-dir", EXTERNAL_SKILLS_DIR
    ]
    
    try:
        # We use check=True and capture_output=True to keep it quiet unless error
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        return f"OK: {repo_path}"
    except subprocess.CalledProcessError as e:
        return f"FAIL: {repo_path} - {e.stderr.strip()[:100]}"
    except Exception as e:
        return f"ERR: {repo_path} - {e}"

def main():
    repos = fetch_repo_list()
    
    # Pre-check existence to count how many to download
    to_download = []
    for r in repos:
        owner, repo = r.split("/")
        repo_dir_name = f"{owner}__{repo}__HEAD"
        if not (Path(EXTERNAL_SKILLS_DIR) / repo_dir_name).exists():
            to_download.append(r)
    
    print(f"Already have {len(repos) - len(to_download)} repositories.")
    print(f"Planning to download {len(to_download)} repositories with {MAX_WORKERS} workers.")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_repo = {executor.submit(download_repo, repo): repo for repo in to_download}
        
        count = 0
        total = len(to_download)
        for future in concurrent.futures.as_completed(future_to_repo):
            count += 1
            res = future.result()
            if count % 10 == 0:
                print(f"[{count}/{total}] {res}")

if __name__ == "__main__":
    main()
