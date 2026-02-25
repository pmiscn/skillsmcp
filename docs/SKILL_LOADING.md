# Skill loading (security & usage)

This repository includes two minimal “skill loader” reference implementations:

- `tools/skill-loader-node/` (Node.js)
- `tools/skill-loader-py/` (Python)

They are designed for ecosystems like **skills.sh** where a “skill” is typically a GitHub repository and there is **no centralized tarball registry**.

## Threat model (what can go wrong)

Loading code from remote repositories introduces multiple risks:

1. **Supply chain attacks**: repo compromised, maintainer account takeover, malicious dependency injection.
2. **TOCTOU** (time-of-check vs time-of-use): fetching “latest” changes between verification and execution.
3. **Tampered transport**: MITM is less likely with HTTPS, but artifacts can still be swapped if you don’t pin.
4. **Extraction attacks** (zip/tar): path traversal (`../`) and symlink tricks.
5. **Runtime escape**: “skill” code may attempt filesystem/network/subprocess access.

## Core recommendations

### 1) Pin to an immutable ref

Always pin skills to a **commit SHA** (preferred) or a release **tag**.

- Commit pinning: immutable (best).
- Tag pinning: mutable in Git; treat tags as “soft pin” unless you verify the tag’s target commit.

Where to set pins:

- Node example: `tools/skill-loader-node/examples/load-skill.js`
  - `--expected-commit <40-hex>` and/or `--expected-tag <tag>`
- Python example: `tools/skill-loader-py/examples/load_skill.py`
  - `--expected-commit <40-hex>` and/or `--expected-tag <tag>`

### 2) Verify the working tree hash

Both loaders can compute a deterministic sha256 over the directory tree (`sha256:<hex>`). Use it as a second layer:

- Detects tampering after checkout
- Detects unintended local modifications

Important: a tree-hash is only meaningful if:

- You define what is included/excluded (both loaders exclude `.git`, `node_modules`, `__pycache__`, etc.)
- You freeze line endings and normalization rules for your environment

### 3) Don’t auto-execute fetched code

These loaders **only**:

- fetch a repo or download a zip
- discover and parse a manifest (`skill.json` / `skill.yml` / `skill.yaml` / `package.json#skill`)
- create registration metadata

They do **not** import/require or execute the skill entry automatically.

If you choose to execute skill code:

- run in a sandbox (container, VM, restricted user)
- impose resource limits (CPU/memory/time)
- restrict network egress unless explicitly required
- mount filesystem read-only wherever possible

### 4) Vet repositories before allowing them

Recommended checklist:

- Owner trust: verified org, known maintainer
- Repository hygiene: signed commits/tags, branch protections
- Dependency review: lockfiles, minimal transitive deps
- Release provenance: CI that builds artifacts reproducibly

For Git operations guidance:

- Prefer `git clone https://github.com/{owner}/{repo}.git` and checkout a pinned commit.
- Consider verifying commit signatures if your org uses GPG/Sigstore.

### 5) Safe extraction for zips

If you download a zip (alternate mechanism), extract safely:

- reject entries with absolute paths
- reject entries with `..` traversal
- handle symlinks carefully (or disallow)

The reference implementations intentionally do **not** implement unzip to avoid accidental unsafe extraction logic.

## Manifest format

Schema: `spec/skill-manifest.schema.json`

Discovery order (both loaders):

1. `skill.json`
2. `skill.yaml`
3. `skill.yml`
4. `package.json` with a top-level `skill` field

Sample manifest for tests:

- `examples/skills/sample_skill/skill.json`

## Operational guidance

- Use a dedicated skills directory (default `./external_skills`).
- Consider a “quarantine” staging directory for downloads.
- Keep an allowlist mapping `id -> { repo, pinnedCommit, sha256 }` and refuse anything else.
- Log: repo URL, pinned ref, computed sha256, and manifest ID/version.
