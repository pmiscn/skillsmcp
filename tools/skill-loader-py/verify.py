from __future__ import annotations

import hashlib
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


DEFAULT_EXCLUDES = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".DS_Store",
}


def compute_tree_sha256(dir_path: str, *, excludes: set[str] | None = None) -> str:
    root = Path(dir_path).resolve()
    exc = excludes or DEFAULT_EXCLUDES
    files: list[Path] = []

    for base, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exc]
        for fn in filenames:
            if fn in exc:
                continue
            files.append(Path(base) / fn)

    files.sort()

    h = hashlib.sha256()
    for f in files:
        rel = f.relative_to(root).as_posix()
        data = f.read_bytes()
        fh = hashlib.sha256(data).hexdigest()
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(str(len(data)).encode("utf-8"))
        h.update(b"\0")
        h.update(fh.encode("utf-8"))
        h.update(b"\n")
    return f"sha256:{h.hexdigest()}"


def get_git_head_commit(dir_path: str) -> str:
    p = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        check=True,
        cwd=dir_path,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.stdout.strip()


def get_git_exact_tag(dir_path: str) -> str | None:
    try:
        p = subprocess.run(
            ["git", "describe", "--tags", "--exact-match"],
            check=True,
            cwd=dir_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return p.stdout.strip()
    except subprocess.CalledProcessError:
        return None


@dataclass
class PinnedRefResult:
    ok: bool
    head_commit: str
    exact_tag: str | None
    reason: str | None = None


def verify_pinned_ref(
    dir_path: str, *, expected_commit: str | None = None, expected_tag: str | None = None
) -> PinnedRefResult:
    head = get_git_head_commit(dir_path)
    tag = get_git_exact_tag(dir_path)
    ok = True
    reason = None
    if expected_commit and head != expected_commit:
        ok = False
        reason = f"HEAD commit mismatch: expected {expected_commit}, got {head}"
    if expected_tag and tag != expected_tag:
        ok = False
        reason = f"Tag mismatch: expected {expected_tag}, got {tag or '(none)'}"
    return PinnedRefResult(ok=ok, head_commit=head, exact_tag=tag, reason=reason)


def verify_sha256(dir_path: str, expected_sha256: str) -> dict:
    actual = compute_tree_sha256(dir_path)
    return {"ok": actual == expected_sha256, "expected": expected_sha256, "actual": actual}
