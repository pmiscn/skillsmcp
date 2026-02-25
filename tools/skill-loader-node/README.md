# skill-loader-node

Minimal Node.js skill fetch/verify/manifest-loader for skills that live in GitHub repositories (e.g., skills.sh listings).

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

## Install

```bash
cd tools/skill-loader-node
npm install
```

## Run example

The example **will attempt to git clone** unless you pass `--local`.

Set expected integrity (pin) in the example:

- `EXPECTED_COMMIT` (40-char SHA)
- or `EXPECTED_TAG` (exact tag)

```bash
node examples/load-skill.js --owner skills-sh --repo some-skill-repo \
  --skills-dir ./external_skills \
  --expected-commit 0123456789abcdef0123456789abcdef01234567
```

Local-only demo (no fetching):

```bash
node examples/load-skill.js --local ../../examples/skills/sample_skill

## Resolve skills.sh URLs (dry-run)

You can resolve a skills.sh URL to its upstream GitHub repo and skill subpath without performing network installs.

Example (dry-run):

```
node examples/resolve-and-dry-run.js https://skills.sh/vercel-labs/skills/find-skills
```

This will print JSON with repoUrl and subpath fields you can pass to the fetch flow.
```

## Tests

```bash
npm test
```

## Zip alternative (illustrative)

If you cannot use `git`, you can download a GitHub archive zip.

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
