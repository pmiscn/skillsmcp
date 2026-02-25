#!/usr/bin/env node
import { resolveFromSkillsSh } from '../src/resolve_skills_sh.js';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node examples/resolve-and-dry-run.js <skills.sh-url>');
    process.exit(2);
  }
  try {
    const r = await resolveFromSkillsSh(url, { preferCli: false });
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('resolve failed:', e?.message || e);
    process.exit(1);
  }
}

main();
