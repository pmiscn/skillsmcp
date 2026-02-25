import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.DS_Store'
]);

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} ${args.join(' ')} failed (code ${code})\n${stderr}`));
    });
  });
}

async function* walkFiles(rootDir, { excludes = DEFAULT_EXCLUDES } = {}) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (excludes.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) yield full;
    }
  }
}

export async function computeTreeSha256(dir, opts) {
  const abs = path.resolve(dir);
  const files = [];
  for await (const f of walkFiles(abs, opts)) files.push(f);
  files.sort();

  const h = crypto.createHash('sha256');
  for (const f of files) {
    const rel = path.relative(abs, f).replaceAll(path.sep, '/');
    const buf = await fs.readFile(f);
    const fh = crypto.createHash('sha256').update(buf).digest('hex');
    h.update(rel);
    h.update('\0');
    h.update(String(buf.length));
    h.update('\0');
    h.update(fh);
    h.update('\n');
  }
  return `sha256:${h.digest('hex')}`;
}

export async function getGitHeadCommit(dir) {
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: dir });
  return stdout.trim();
}

export async function getGitExactTag(dir) {
  try {
    const { stdout } = await run('git', ['describe', '--tags', '--exact-match'], { cwd: dir });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function verifyPinnedRef(dir, { expectedCommit = null, expectedTag = null } = {}) {
  const result = { ok: true, headCommit: null, exactTag: null };
  result.headCommit = await getGitHeadCommit(dir);
  result.exactTag = await getGitExactTag(dir);

  if (expectedCommit && result.headCommit !== expectedCommit) {
    result.ok = false;
    result.reason = `HEAD commit mismatch: expected ${expectedCommit}, got ${result.headCommit}`;
  }

  if (expectedTag && result.exactTag !== expectedTag) {
    result.ok = false;
    result.reason = `Tag mismatch: expected ${expectedTag}, got ${result.exactTag ?? '(none)'}`;
  }

  return result;
}

export async function verifySha256(dir, expectedSha256) {
  const actual = await computeTreeSha256(dir);
  return { ok: actual === expectedSha256, expected: expectedSha256, actual };
}
