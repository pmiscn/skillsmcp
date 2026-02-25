#!/usr/bin/env python3
"""Fetch all pages from skills.sh /api/skills/all-time and write owner/skillId lines.

Usage: python3 tools/fetch_skills_sh_alltime.py
"""
import json
import time
import urllib.request
from urllib.error import URLError, HTTPError

OUT = "/tmp/skills_alltime_entries.txt"
DELAY = 0.25

def fetch_page(page):
    url = f"https://skills.sh/api/skills/all-time/{page}"
    req = urllib.request.Request(url, headers={"User-Agent": "skills-sync-agent/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    # resume if OUT exists
    seen = set()
    total_written = 0
    page = 1
    try:
        with open(OUT, "r", encoding="utf-8") as existing:
            for line in existing:
                seen.add(line)
        # estimate last page from existing entries (pages appear to contain 200 items)
        existing_count = len(seen)
        if existing_count > 0:
            page = max(1, existing_count // 200)
            # start from next page to avoid re-processing the same page
            page = page + 1
            total_written = existing_count
    except FileNotFoundError:
        pass
    # open in append mode to preserve existing entries
    with open(OUT, "a", encoding="utf-8") as out:
        while True:
            try:
                data = fetch_page(page)
            except (HTTPError, URLError) as e:
                print(f"fetch error page={page}: {e}")
                break
            skills = data.get("skills", [])
            if not skills:
                break
            for s in skills:
                src = s.get("source")
                skillId = s.get("skillId")
                if not src:
                    continue
                line = f"{src}/{skillId}\n"
                if line in seen:
                    continue
                seen.add(line)
                out.write(line)
                total_written += 1
            print(f"page={page} items={len(skills)} total_written={total_written}")
            if not data.get("hasMore"):
                break
            page += 1
            time.sleep(DELAY)
    print("done", total_written)

if __name__ == '__main__':
    main()
