import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function discoverManifestFile(skillDir) {
  const candidates = ['SKILL.md', 'skill.json', 'skill.yaml', 'skill.yml', 'package.json'];
  for (const name of candidates) {
    const full = path.join(skillDir, name);
    if (!(await fileExists(full))) continue;

    if (name === 'package.json') {
      try {
        const raw = await fs.readFile(full, 'utf8');
        const pkg = JSON.parse(raw);
        if (pkg.skill) return full;
        continue;
      } catch {
        continue;
      }
    }

    return full;
  }
  return null;
}

export async function loadManifest(skillDir) {
  const file = await discoverManifestFile(skillDir);
  if (!file) return null;

  const base = path.basename(file);
  const raw = await fs.readFile(file, 'utf8');

  if (base === 'SKILL.md') {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const manifest = match?.[1] ? YAML.parse(match[1]) : {};
    return { manifest, source: 'SKILL.md' };
  }

  if (base === 'skill.json') {
    const manifest = JSON.parse(raw);
    return { manifest, source: 'skill.json' };
  }

  if (base === 'skill.yaml' || base === 'skill.yml') {
    const manifest = YAML.parse(raw);
    return { manifest, source: base };
  }

  if (base === 'package.json') {
    const pkg = JSON.parse(raw);
    if (!pkg.skill) return null;
    if (typeof pkg.skill !== 'object')
      throw new Error('package.json skill field must be an object');
    return { manifest: pkg.skill, source: 'package.json#skill' };
  }

  throw new Error(`Unsupported manifest file: ${file}`);
}

export function validateManifest(manifest) {
  const missing = [];
  if (manifest?.schemaVersion || manifest?.id) {
    for (const k of ['id', 'name']) {
      if (!manifest?.[k]) missing.push(k);
    }
  }
  if (missing.length) throw new Error(`Manifest missing required fields: ${missing.join(', ')}`);
}

export function buildRegistrationInfo(manifest, skillDir, { runtime = 'node' } = {}) {
  const entryPath =
    runtime === 'node'
      ? (manifest?.entry?.node ?? manifest?.entry?.path)
      : runtime === 'python'
        ? (manifest?.entry?.python ?? manifest?.entry?.path)
        : manifest?.entry?.path;

  let id = manifest.id;
  if (!id) {
    const absPath = path.resolve(skillDir);
    const parts = absPath.split(path.sep);
    const extIdx = parts.lastIndexOf('external_skills');
    if (extIdx !== -1 && parts.length > extIdx + 1) {
      const repoDir = parts[extIdx + 1];
      if (repoDir.includes('__')) {
        const [owner, repo] = repoDir.split('__');
        const subpath = parts.slice(extIdx + 2).join('::');
        id = subpath ? `${owner}::${repo}::${subpath}` : `${owner}::${repo}`;
      }
    }
  }

  return {
    id: id ?? `local::${path.basename(skillDir)}`,
    name: manifest.name ?? path.basename(skillDir),
    version: manifest.version ?? '0.0.0',
    description: manifest.description ?? null,
    dir: path.resolve(skillDir),
    entry: {
      runtime,
      path: entryPath ?? null,
      exports: manifest?.entry?.exports ?? {},
    },
    repository: manifest.repository ?? null,
    integrity: manifest.integrity ?? null,
  };
}

export function createRegistry() {
  const byId = new Map();
  return {
    register(info) {
      if (!info?.id) throw new Error('registry.register requires info.id');
      byId.set(info.id, info);
      return info;
    },
    get(id) {
      return byId.get(id) ?? null;
    },
    list() {
      return Array.from(byId.values());
    },
  };
}

async function walkAndDiscover(skillDir, results = []) {
  const manifest = await discoverManifestFile(skillDir);
  if (manifest) {
    results.push(skillDir);
  }

  let entries = [];
  try {
    entries = await fs.readdir(skillDir, { withFileTypes: true });
  } catch (e) {
    return results;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const name = entry.name;
      if (name === '.git' || name === 'node_modules' || name === 'dist' || name === 'build')
        continue;

      const isAllowedHiddenDir = ['.claude', '.agents', '.config', '.github'].includes(name);
      if (name.startsWith('.') && !isAllowedHiddenDir) {
        continue;
      }

      await walkAndDiscover(path.join(skillDir, name), results);
    }
  }
  return results;
}

export async function loadAndRegister({ skillDir, registry, runtime = 'node' }) {
  const skillDirs = await walkAndDiscover(skillDir);

  const results = [];
  for (const dir of skillDirs) {
    try {
      const loaded = await loadManifest(dir);
      if (!loaded) continue;
      const { manifest, source } = loaded;
      validateManifest(manifest);
      const info = buildRegistrationInfo(manifest, dir, { runtime });
      info.manifestSource = source;
      results.push(registry.register(info));
    } catch (e) {
      console.error(`Failed to load skill in ${dir}: ${e.message}`);
    }
  }

  if (results.length === 0) {
    throw new Error(`No valid manifest found in ${skillDir} or its subdirectories`);
  }

  return results.length === 1 ? results[0] : results;
}
