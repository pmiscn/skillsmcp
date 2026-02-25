import assert from 'node:assert/strict';
import { resolveFromSkillsSh } from '../src/resolve_skills_sh.js';

// Note: these tests are light and only exercise parsing. They avoid network by using preferCli=false
async function testParse() {
  const r = await resolveFromSkillsSh('https://skills.sh/vercel-labs/skills/find-skills', { preferCli: false });
  assert.ok(r.repoUrl.includes('github.com'));
  assert.equal(r.skill, 'find-skills');
}

testParse().then(() => console.log('resolve.test.js OK')).catch((e) => { console.error(e); process.exit(1); });
