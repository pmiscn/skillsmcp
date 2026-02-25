from __future__ import annotations

import os
import re
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path


def _assert_safe_child_path(parent: Path, child: Path) -> None:
    parent = parent.resolve()
    child = child.resolve()
    try:
        child.relative_to(parent)
    except ValueError as e:
        raise ValueError(f"Refusing to write outside dest_dir: {child}") from e


@dataclass
class FetchResult:
    skill_dir: str
    method: str
    ref: str | None
    clone_url: str | None = None
    zip_url: str | None = None
    zip_file: str | None = None


def fetch_skill(
    *,
    owner: str,
    repo: str,
    dest_dir: str = "./external_skills",
    ref: str | None = None,
    method: str = "git",
    clean: bool = False,
) -> FetchResult:
    """
    Fetch a GitHub repo into dest_dir.

    Primary mechanism: git clone using clone URL pattern
      https://github.com/{owner}/{repo}.git

    Alternate mechanism: download zip
      https://github.com/{owner}/{repo}/archive/{ref}.zip
    """
    if not owner or not repo:
        raise ValueError("owner and repo are required")

    abs_dest = Path(dest_dir).resolve()
    abs_dest.mkdir(parents=True, exist_ok=True)

    safe_ref = re.sub(r"[^a-zA-Z0-9._-]", "_", ref or "HEAD")
    target_dir = abs_dest / f"{owner}__{repo}__{safe_ref}"
    _assert_safe_child_path(abs_dest, target_dir)

    if clean and target_dir.exists():
        shutil.rmtree(target_dir)

    clone_url = f"https://github.com/{owner}/{repo}.git"

    if method == "git":
        args = ["git", "clone", "--filter=blob:none", "--no-tags"]
        if ref:
            args += ["--branch", ref]
        args += [clone_url, str(target_dir)]

        subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if ref and re.fullmatch(r"[0-9a-fA-F]{40}", ref):
            subprocess.run(
                ["git", "fetch", "--depth", "1", "origin", ref],
                check=True,
                cwd=str(target_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            subprocess.run(
                ["git", "checkout", "--detach", ref],
                check=True,
                cwd=str(target_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

        return FetchResult(skill_dir=str(target_dir), method=method, ref=ref, clone_url=clone_url)

    if method == "zip":
        if not ref:
            raise ValueError("zip method requires ref (tag/commit/branch)")
        zip_url = f"https://github.com/{owner}/{repo}/archive/{ref}.zip"
        zip_file = str(target_dir) + ".zip"
        # Intentionally not extracting here to keep dependencies minimal.
        urllib.request.urlretrieve(zip_url, zip_file)  # nosec B310 (example tooling)
        return FetchResult(
            skill_dir=str(target_dir),
            method=method,
            ref=ref,
            zip_url=zip_url,
            zip_file=zip_file,
        )

    raise ValueError(f"Unknown method: {method}")
