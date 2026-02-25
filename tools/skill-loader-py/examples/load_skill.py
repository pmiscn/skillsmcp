from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running this script without installing the project.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fetch import fetch_skill  # noqa: E402
from loader import Registry, load_and_register  # noqa: E402
from verify import compute_tree_sha256, verify_pinned_ref, verify_sha256  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", help="Load from a local directory (no fetch)")
    ap.add_argument("--owner")
    ap.add_argument("--repo")
    ap.add_argument("--ref", default=None)
    ap.add_argument("--method", default="git", choices=["git", "zip"])
    ap.add_argument("--skills-dir", default="./external_skills")
    ap.add_argument("--expected-commit", default=None)  # set your pinned commit here
    ap.add_argument("--expected-tag", default=None)  # or set pinned tag here
    ap.add_argument("--expected-sha256", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    registry = Registry.create()

    if args.local:
        skill_dir = str(Path(args.local).resolve())
    else:
        if not args.owner or not args.repo:
            raise SystemExit("Provide --owner and --repo, or use --local")

        ref = args.ref or args.expected_commit or args.expected_tag

        if args.dry_run:
            print(
                json.dumps(
                    {
                        "dryRun": True,
                        "wouldFetch": {
                            "owner": args.owner,
                            "repo": args.repo,
                            "ref": ref,
                            "method": args.method,
                            "skillsDir": args.skills_dir,
                        },
                    },
                    indent=2,
                )
            )
            return 0

        fetched = fetch_skill(
            owner=args.owner,
            repo=args.repo,
            dest_dir=args.skills_dir,
            ref=ref,
            method=args.method,
            clean=True,
        )
        skill_dir = fetched.skill_dir

    if args.expected_commit or args.expected_tag:
        pinned = verify_pinned_ref(skill_dir, expected_commit=args.expected_commit, expected_tag=args.expected_tag)
        if not pinned.ok:
            raise SystemExit(f"Pinned ref verification failed: {pinned.reason}")

    actual_sha = compute_tree_sha256(skill_dir)
    if args.expected_sha256:
        r = verify_sha256(skill_dir, args.expected_sha256)
        if not r["ok"]:
            raise SystemExit(f"sha256 mismatch: expected {r['expected']} got {r['actual']}")

    reg = load_and_register(skill_dir=skill_dir, registry=registry, runtime="python")

    print(
        json.dumps(
            {
                "registered": reg,
                "computed": {"sha256": actual_sha},
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
