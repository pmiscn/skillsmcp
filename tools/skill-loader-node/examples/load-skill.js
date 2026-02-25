import path from 'node:path';
import process from 'node:process';
import { fetchSkill } from '../src/fetch.js';
import { createRegistry, loadAndRegister } from '../src/loader.js';
import { computeTreeSha256, verifyPinnedRef, verifySha256 } from '../src/verify.js';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function flag(name) {
  return process.argv.includes(name);
}

async function main() {
  const registry = createRegistry();

  const localDir = arg('--local');
  const skillsDir = arg('--skills-dir') ?? './external_skills';

  const expectedCommit = arg('--expected-commit') ?? null; // set your pinned commit here
  const expectedTag = arg('--expected-tag') ?? null; // or set pinned tag here
  const expectedSha256 = arg('--expected-sha256') ?? null; // optional

  let skillDir;

  if (localDir) {
    skillDir = path.resolve(localDir);
  } else {
    const owner = arg('--owner');
    const repo = arg('--repo');
    const ref = arg('--ref') ?? expectedCommit ?? expectedTag ?? null;
    const method = arg('--method') ?? 'git';

    if (!owner || !repo) {
      throw new Error('Provide --owner and --repo, or use --local');
    }

    if (flag('--dry-run')) {
      console.log('[dry-run] would fetch skill', { owner, repo, ref, method, skillsDir });
      process.exit(0);
    }

    const fetched = await fetchSkill({ owner, repo, destDir: skillsDir, ref, method, clean: true });
    skillDir = fetched.skillDir;
  }

  // Integrity checks (require local git checkout for pinned ref checks).
  if (expectedCommit || expectedTag) {
    const pinned = await verifyPinnedRef(skillDir, { expectedCommit, expectedTag });
    if (!pinned.ok) throw new Error(`Pinned ref verification failed: ${pinned.reason}`);
  }

  const actualSha256 = await computeTreeSha256(skillDir);
  if (expectedSha256) {
    const r = await verifySha256(skillDir, expectedSha256);
    if (!r.ok) throw new Error(`sha256 mismatch: expected ${r.expected} got ${r.actual}`);
  }

  const registration = await loadAndRegister({ skillDir, registry, runtime: 'node' });

  console.log(
    JSON.stringify(
      {
        registered: registration,
        computed: { sha256: actualSha256 }
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
