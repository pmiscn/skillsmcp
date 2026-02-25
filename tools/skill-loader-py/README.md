# skill-loader-py

Minimal Python skill fetch/verify/manifest-loader for skills that live in GitHub repositories (e.g., skills.sh listings).

## What it does

- Fetches a skill repo via **GitHub clone URL** (primary):
  - `https://github.com/{owner}/{repo}.git`
- Supports an alternate **zip download** flow (implementation + example curl).
- Verifies integrity by:
  - Checking a **pinned commit SHA** and/or **pinned tag** (via local `git` when available)
  - Computing a deterministic **sha256** over the fetched directory tree
- Discovers manifest in this order:
  1. `skill.json`
  2. `skill.yaml`
  3. `skill.yml`
  4. `package.json` containing a top-level `skill` field
- Registers a skill into a tiny in-memory registry interface.

Default skills directory: `./external_skills` (configurable).

## Install (for running locally)

```bash
cd tools/skill-loader-py
python -m venv .venv
source .venv/bin/activate
pip install -e .
pip install pytest
```

## Run example

The example **will attempt to git clone** unless you pass `--local`.

Set expected integrity (pin) in the example:

- `--expected-commit` (40-char SHA)
- or `--expected-tag` (exact tag)

```bash
python examples/load_skill.py --owner skills-sh --repo some-skill-repo \
  --skills-dir ./external_skills \
  --expected-commit 0123456789abcdef0123456789abcdef01234567
```

Local-only demo (no fetching):

```bash
python examples/load_skill.py --local ../../examples/skills/sample_skill
```

## Tests

```bash
pytest
```

## Zip alternative (illustrative)

Example curl (replace `<ref>` with a tag/commit/branch):

```bash
curl -L \
  -o skill.zip \
  "https://github.com/<owner>/<repo>/archive/<ref>.zip"
```

Then unzip into your skills directory and run the loader over that directory.

## Notes

- This loader **does not execute** remote code automatically.
- For security guidance, see `docs/SKILL_LOADING.md`.
