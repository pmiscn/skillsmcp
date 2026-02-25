import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { loadManifest, validateManifest } from '../src/loader.js';

test('loads sample skill.json manifest', async () => {
  const dir = path.resolve('../../examples/skills/sample_skill');
  const { manifest, source } = await loadManifest(dir);
  assert.equal(source, 'skill.json');
  validateManifest(manifest);
  assert.equal(manifest.id, 'examples.sample_skill');
  assert.equal(manifest.entry.node, 'index.js');
});

test('falls back to package.json#skill', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-loader-node-'));
  await fs.writeFile(
    path.join(tmp, 'package.json'),
    JSON.stringify(
      {
        name: 'dummy',
        skill: {
          schemaVersion: '1.0',
          id: 'dummy.skill',
          name: 'Dummy Skill',
          version: '0.0.1',
          entry: { node: 'index.js' }
        }
      },
      null,
      2
    ),
    'utf8'
  );

  const { manifest, source } = await loadManifest(tmp);
  assert.equal(source, 'package.json#skill');
  validateManifest(manifest);
  assert.equal(manifest.id, 'dummy.skill');
});
