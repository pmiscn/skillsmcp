import https from 'node:https';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'skill-loader-node' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGetText(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

function parseSkillsShUrl(urlStr) {
  // expected patterns:
  // https://skills.sh/{owner}/{repo}/{skill-name}
  // https://skills.sh/{owner}/{repo}
  const u = new URL(urlStr);
  const segs = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segs.length === 0) throw new Error('invalid skills.sh url');
  const owner = segs[0];
  const repo = segs[1] ?? null;
  const skill = segs[2] ?? null;
  return { owner, repo, skill };
}

export async function resolveFromSkillsSh(urlStr, { preferCli = true } = {}) {
  const { owner, repo, skill } = parseSkillsShUrl(urlStr);

  // Try to use npx skills CLI to resolve (dry-run) if available
  if (preferCli) {
    try {
      // run 'npx --no-install skills info <owner>/<repo>@<skill>' or 'npx --no-install skills info <owner>/<repo>'
      const target = repo ? `${owner}/${repo}${skill ? `@${skill}` : ''}` : owner;
      const cp = spawn('npx', ['--no-install', 'skills', 'info', target], { stdio: ['ignore', 'pipe', 'pipe'] });
      const out = [];
      for await (const c of cp.stdout) out.push(c);
      for await (const c of cp.stderr) out.push(c);
      const outStr = Buffer.concat(out).toString('utf8');
      // try to parse typical output containing GitHub URL
      const m = outStr.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
      if (m) {
        const repoUrl = m[0];
        // if skill present, include subpath info via '@skill'
        return { repoUrl, subpath: skill ? `skills/${skill}` : null, skill };
      }
    } catch (e) {
      // ignore CLI failure and fallback to scraping
    }
  }

  // Fallback: fetch skills.sh page and parse anchor links for GitHub
  const pageUrl = `https://skills.sh/${owner}${repo ? `/${repo}` : ''}${skill ? `/${skill}` : ''}`;
  const html = await httpGetText(pageUrl);
  // find first github.com link
  const m = html.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g);
  if (!m || m.length === 0) throw new Error('no github repo found on skills.sh page');
  const repoUrl = m[0];
  const subpath = skill ? `skills/${skill}` : null;
  return { repoUrl, subpath, skill };
}

export default { resolveFromSkillsSh };
