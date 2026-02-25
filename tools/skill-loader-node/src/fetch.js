import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import https from 'node:https';
import AdmZip from 'adm-zip';

function assertSafeChildPath(parentDir, childDir) {
  const rel = path.relative(parentDir, childDir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside destDir: ${childDir}`);
  }
}

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(`${cmd} ${args.join(' ')} failed (code ${code})\n${stderr}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });
  });
}

async function downloadToFile(url, outFile) {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'skill-loader-node' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(res.headers.location, outFile));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', async () => {
        await fs.writeFile(outFile, Buffer.concat(chunks));
        resolve();
      });
    });
    req.on('error', reject);
  });
}

export async function fetchSkill({
  owner,
  repo,
  destDir = './external_skills',
  ref = null,
  method = 'git',
  clean = false,
}) {
  if (!owner || !repo) throw new Error('owner and repo are required');

  const absDestDir = path.resolve(destDir);
  await fs.mkdir(absDestDir, { recursive: true });

  const safeRef = (ref ?? 'HEAD').replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetDir = path.join(absDestDir, `${owner}__${repo}__${safeRef}`);
  assertSafeChildPath(absDestDir, targetDir);

  const targetExists = await fs
    .access(targetDir)
    .then(() => true)
    .catch(() => false);

  if (targetExists) {
    if (clean) {
      await fs.rm(targetDir, { recursive: true, force: true });
    } else if (method === 'git') {
      // Optimized sync: if it exists and we're using git, just pull the latest
      try {
        await run('git', ['fetch', '--depth', '1'], { cwd: targetDir });
        const refToCheckout = ref || 'HEAD';
        await run('git', ['checkout', refToCheckout], { cwd: targetDir });
        await run('git', ['pull', 'origin', refToCheckout], { cwd: targetDir });
        return {
          skillDir: targetDir,
          method,
          cloneUrl: `https://github.com/${owner}/${repo}.git`,
          ref: ref ?? null,
          updated: true,
        };
      } catch (err) {
        console.warn(
          `Failed to update existing repo at ${targetDir}, falling back to full clone: ${err.message}`,
        );
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    } else {
      // For zip or other methods without 'clean', we might want to re-download
      // but for now let's skip if it exists and not clean.
      return { skillDir: targetDir, method, ref, status: 'exists' };
    }
  }

  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  if (method === 'git') {
    const cloneArgs = ['clone', '--filter=blob:none', '--no-tags'];
    if (ref && ref !== 'HEAD') cloneArgs.push('--branch', ref);
    cloneArgs.push(cloneUrl, targetDir);

    await run('git', cloneArgs);

    if (ref && /^[0-9a-f]{40}$/i.test(ref)) {
      await run('git', ['fetch', '--depth', '1', 'origin', ref], { cwd: targetDir });
      await run('git', ['checkout', '--detach', ref], { cwd: targetDir });
    }

    return { skillDir: targetDir, method, cloneUrl, ref: ref ?? null };
  }

  if (method === 'zip') {
    if (!ref) throw new Error('zip method requires ref (tag/commit/branch)');
    const zipUrl = `https://github.com/${owner}/${repo}/archive/${ref}.zip`;
    const zipFile = path.join(absDestDir, `${owner}__${repo}__${safeRef}.zip`);

    await downloadToFile(zipUrl, zipFile);

    const zip = new AdmZip(zipFile);
    await fs.mkdir(targetDir, { recursive: true });
    zip.extractAllTo(targetDir, true);

    const entries = await fs.readdir(targetDir);
    if (entries.length === 1) {
      const innerDir = path.join(targetDir, entries[0]);
      const stat = await fs.stat(innerDir);
      if (stat.isDirectory()) {
        const tempDir = targetDir + '_temp';
        await fs.rename(innerDir, tempDir);
        await fs.rm(targetDir, { recursive: true, force: true });
        await fs.rename(tempDir, targetDir);
      }
    }

    await fs.rm(zipFile, { force: true });

    return { skillDir: targetDir, method, zipUrl, ref };
  }

  throw new Error(`Unknown method: ${method}`);
}
