import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import archiver from 'archiver';
import multer from 'multer';
// Dynamically import adm-zip where needed to avoid TypeScript declaration issues
// (a local declaration file exists, but dynamic import avoids compile-time errors in some setups)
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { syncJobManager } from './SyncJobManager.js';
import prisma from '../db.js';

import { fileURLToPath } from 'url';

const router = Router();
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure multer uses a deterministic temp folder under PROJECT_ROOT/uploads
const uploadTempDir = path.resolve(process.cwd(), 'uploads');
const upload = multer({ dest: uploadTempDir });

// Debug startup info (will be printed after constants are defined)

const SKILLSHUB_BASE_URL = 'http://127.0.0.1:8001';
// Calculate PROJECT_ROOT relative to repository root.
const PROJECT_ROOT = ((): string => {
  const parts = __dirname.split(path.sep);
  const apiIdx = parts.lastIndexOf('api');
  if (apiIdx !== -1) {
    // We want the directory containing 'api', not the 'api' directory itself
    return parts.slice(0, apiIdx).join(path.sep) || path.sep;
  }
  return path.resolve(process.cwd());
})();

const resolveRootPath = (...args: string[]) => {
  return path.resolve(PROJECT_ROOT, ...args);
};

const MANUAL_UPLOADS_DIR = resolveRootPath('external_skills', 'manual_uploads');

// Startup debug info
console.log('[Startup] __dirname=', __dirname);
console.log('[Startup] PROJECT_ROOT=', PROJECT_ROOT);
console.log('[Startup] MANUAL_UPLOADS_DIR=', MANUAL_UPLOADS_DIR);

const parseBooleanFlag = (value: unknown) => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  return false;
};

const parseTagsField = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    // allow JSON array payloads in form fields
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((t) => String(t).trim()).filter(Boolean);
        }
      } catch {}
    }
    return trimmed
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
};

const safeParseJSON = (val: string | null | undefined, fallback: any = null) => {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch (e) {
    console.warn(`Failed to parse JSON field: ${val.substring(0, 100)}...`);
    return fallback;
  }
};

const fetchJSON = async (url: string, options?: any) => {
  const response = await fetch(url, options);
  const text = await response.text();

  const trimmed = text.trim();
  if (!trimmed || trimmed === ': heartbeat' || trimmed.startsWith('<!DOCTYPE html>')) {
    return {
      data: {
        code: '204.NON_JSON_BODY',
        message: 'Non-JSON response received',
        detail: trimmed.substring(0, 100),
      },
      status: response.status,
      ok: response.ok,
    };
  }

  try {
    return { data: JSON.parse(text), status: response.status, ok: response.ok };
  } catch (e) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      console.error(`Failed to parse JSON from ${url}: ${text.substring(0, 200)}`);
    }
    return {
      data: {
        code: '500.UNEXPECTED_RESPONSE',
        message: `Server returned ${response.status} with malformed JSON`,
        detail: text.substring(0, 200),
      },
      status: response.status,
      ok: false,
    };
  }
};

const mergeManifestDefaults = (base: any, defaults: any) => {
  const out = { ...(base ?? {}) };
  const keys = ['name', 'name_zh', 'description', 'description_zh', 'contact', 'tags'];
  for (const k of keys) {
    const existing = out[k];
    const existingIsEmptyString = typeof existing === 'string' && existing.trim() === '';
    const existingIsEmptyArray = Array.isArray(existing) && existing.length === 0;
    if (
      existing === undefined ||
      existing === null ||
      existingIsEmptyString ||
      existingIsEmptyArray
    ) {
      if (defaults?.[k] !== undefined) out[k] = defaults[k];
    }
  }
  return out;
};

const parseManifestFromRequestBody = (body: any) => {
  if (!body) return {};
  const raw = body.manifest;
  if (raw) {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      // If manifest is present but not valid JSON, fall through to field-based parsing.
    }
    if (typeof raw === 'object') return raw;
  }

  // Support form fields directly (multipart/form-data) without nested JSON.
  const manifest: any = {};
  if (body.name) manifest.name = String(body.name);
  if (body.name_zh) manifest.name_zh = String(body.name_zh);
  if (body.description) manifest.description = String(body.description);
  if (body.description_zh) manifest.description_zh = String(body.description_zh);
  if (body.contact) manifest.contact = String(body.contact);
  const tags = parseTagsField(body.tags ?? body['tags[]']);
  if (tags.length) manifest.tags = tags;
  return manifest;
};

const parseSkillMdFrontmatter = (content: string) => {
  // Minimal YAML subset parser for common SKILL.md frontmatter.
  // Supports:
  // ---
  // name: foo
  // description: bar
  // tags:
  //   - a
  //   - b
  // ---
  const out: any = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return out;

  const frontmatterBlock = match[1] ?? '';
  const lines = frontmatterBlock.split(/\r?\n/);
  let currentListKey: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    const listItemMatch = trimmed.match(/^-\s+(.*)$/);
    if (listItemMatch && currentListKey) {
      if (!Array.isArray(out[currentListKey])) out[currentListKey] = [];
      const item = (listItemMatch[1] ?? '').trim();
      if (item) out[currentListKey].push(item);
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const valueRaw = kv[2];
    if (!key || valueRaw === undefined) continue;

    if (valueRaw === '') {
      // start of block/list
      currentListKey = key;
      out[key] = out[key] ?? [];
      continue;
    }
    currentListKey = null;

    const value = valueRaw.replace(/^['"]|['"]$/g, '').trim();
    if (key === 'tags') {
      out.tags = parseTagsField(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

const findFirstFileNamed = async (rootDir: string, fileName: string) => {
  const queue: string[] = [rootDir];
  let visited = 0;
  const maxVisited = 5000;

  while (queue.length) {
    const dir = queue.shift()!;
    visited++;
    if (visited > maxVisited) return null;

    let entries: import('fs').Dirent[] = [];
    try {
      // @ts-ignore
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const name = ent.name;
      if (name === 'node_modules' || name === '.git') continue;
      const fullPath = path.join(dir, name);
      if (ent.isDirectory()) queue.push(fullPath);
      else if (ent.isFile() && name === fileName) return fullPath;
    }
  }

  return null;
};

const safeExtractZipToDir = async (zipPath: string, destDir: string) => {
  // Use the system 'unzip' command to extract zip archives to avoid JS zip lib typing issues.
  // This also keeps extraction consistent with tar extraction (safeguarded by destDir).
  await fs.mkdir(destDir, { recursive: true });
  console.log(`[ManualImport] Extracting zip ${zipPath} -> ${destDir}`);
  try {
    await runCommand('unzip', ['-qq', path.resolve(zipPath), '-d', destDir]);
  } catch (e: any) {
    console.warn('[ManualImport] unzip failed, trying jar fallback:', e?.message);
    // fallback to jar (available with JDK) as last resort
    await runCommand('jar', ['-xf', path.resolve(zipPath)], destDir);
  }
};

const getSkillAbsolutePath = (skillPath: string | null) => {
  if (!skillPath) return null;
  return path.isAbsolute(skillPath)
    ? skillPath
    : path.resolve(PROJECT_ROOT, skillPath.replace(/^projects\/skillsmcp\//, ''));
};

const buildQueryString = (query: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined) params.append(key, String(entry));
      }
    } else if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  return params.toString();
};

const requireAdmin = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: '403.ADMIN_REQUIRED' });
  }
  return next();
};

router.get('/sync/stream/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const token = req.query.token as string;

  if (!token) {
    console.error(`[SSE] Missing token for job ${jobId}`);
    return res.status(401).json({ code: '401.MISSING_TOKEN' });
  }

  try {
    const jwt = (await import('jsonwebtoken')).default;
    const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-key-change-this-in-production';
    jwt.verify(token, JWT_SECRET);
    console.log(`[SSE] Token verified for job ${jobId}`);
  } catch (e: any) {
    console.error(`[SSE] Token verification failed for job ${jobId}: ${e.message}`);
    return res.status(403).json({ code: '403.INVALID_TOKEN' });
  }

  const job = syncJobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ code: '404.JOB_NOT_FOUND' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  job.logs.forEach((log) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Keep-alive heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  if (job.status === 'completed' || job.status === 'failed') {
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ type: 'status', status: job.status })}\n\n`);
    res.end();
    return;
  }

  const logHandler = (log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  const completeHandler = (finishedJob: any) => {
    res.write(`data: ${JSON.stringify({ type: 'status', status: finishedJob.status })}\n\n`);
    cleanup();
    res.end();
  };

  const cleanup = () => {
    clearInterval(heartbeat);
    syncJobManager.removeListener(`log:${jobId}`, logHandler);
    syncJobManager.removeListener(`complete:${jobId}`, completeHandler);
  };

  syncJobManager.on(`log:${jobId}`, logHandler);
  syncJobManager.on(`complete:${jobId}`, completeHandler);

  req.on('close', cleanup);
});

router.use(authenticateToken);

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;
  const sort = req.query.sort as string;

  try {
    const orderBy: any[] = [];
    if (sort === 'security') {
      orderBy.push({ security_score: 'desc' });
    }
    orderBy.push({ weight: 'desc' }, { installs: 'desc' }, { updatedAt: 'desc' });

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        skip,
        take: limit,
        orderBy,
      }),
      prisma.skill.count(),
    ]);

    const formattedSkills = skills.map((s) => ({
      id: s.id,
      name: s.name,
      name_zh: s.name_zh,
      description: s.description,
      description_zh: s.description_zh,
      tags: s.tags ? s.tags.split(',').map((t) => t.trim()) : [],
      owner: s.owner,
      contact: s.contact,
      weight: s.weight,
      installs: s.installs,
      stars: s.stars,
      security_score: s.security_score,
      security_data: safeParseJSON(s.security_data),
      quality_score: s.quality_score ?? null,
      risk_data: safeParseJSON(s.risk_data),
      has_prompts: Boolean(s.prompt_templates),
      has_install_guide: Boolean(s.install_guide),
      updated_at: s.updatedAt.toISOString(),
      skill_path: s.skill_path,
      source: s.source,
    }));

    res.json({
      skills: formattedSkills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch skills from database:', error);
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.get('/search', async (req: AuthRequest, res) => {
  const allowedEngines = new Set(['auto', 'tfidf', 'sbert', 'hybrid']);
  let engine = req.query.engine;

  if (engine === undefined && req.user?.search_engine) {
    engine = req.user.search_engine;
    req.query.engine = engine;
  }

  if (typeof engine === 'string' && !allowedEngines.has(engine)) {
    return res.status(400).json({ code: '400.INVALID_ENGINE' });
  }

  const queryString = buildQueryString(req.query as Record<string, unknown>);
  const url = `${SKILLSHUB_BASE_URL}/search${queryString ? `?${queryString}` : ''}`;

  try {
    const { data, status } = await fetchJSON(url);

    if (Array.isArray(data?.results)) {
      const resultIds = data.results.map((r: any) => String(r.id));
      const installedSkills = await prisma.skill.findMany({
        where: { id: { in: resultIds } },
        select: { id: true },
      });
      const installedIds = new Set(installedSkills.map((s) => s.id));

      data.results = data.results.map((result: any) => ({
        ...result,
        installed: installedIds.has(String(result.id)),
      }));

      if (req.query.sort === 'heat') {
        data.results.sort((a: any, b: any) => (b.installs || 0) - (a.installs || 0));
      }
    }
    res.status(status).json(data);
  } catch (error) {
    res.status(502).json({ code: '502.SKILLSHUB_UNAVAILABLE' });
  }
});

router.get(['/index', '/index/status'], async (_req, res) => {
  const queryString = buildQueryString(_req.query as Record<string, unknown>);
  const url = `${SKILLSHUB_BASE_URL}/index${queryString ? `?${queryString}` : ''}`;
  try {
    const { data, status } = await fetchJSON(url);
    res.status(status).json(data);
  } catch {
    res.status(502).json({ code: '502.SKILLSHUB_UNAVAILABLE' });
  }
});

router.get('/stats', async (_req, res) => {
  try {
    const totalSkills = await prisma.skill.count();

    let vectorizedSkills = 0;
    try {
      const { data } = await fetchJSON(`${SKILLSHUB_BASE_URL}/index`);
      if (data?.meta) {
        const metaPath = data.meta.meta_path || 'skills_meta.json';
        const metaFullPath = path.resolve(PROJECT_ROOT, metaPath);
        try {
          const metaContent = await fs.readFile(metaFullPath, 'utf-8');
          const meta = JSON.parse(metaContent);
          vectorizedSkills = Array.isArray(meta) ? meta.length : Object.keys(meta).length;
        } catch {
          vectorizedSkills = 0;
        }
      }
    } catch {
      vectorizedSkills = 0;
    }

    res.json({
      totalSkills,
      vectorizedSkills,
      pendingVectorization: Math.max(0, totalSkills - vectorizedSkills),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to fetch stats' });
  }
});

const execFileAsync = promisify(execFile);

const runCommand = async (command: string, args: string[], cwd?: string) => {
  const msg = `Running command: ${command} ${args.join(' ')}`;
  console.log(msg);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: cwd || PROJECT_ROOT,
      timeout: 1000 * 60 * 5,
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });
    console.log(`Command success: ${command}`);
    return { stdout, stderr };
  } catch (error: any) {
    console.error(`Command failed: ${command}`, error);
    const { normalizeError } = await import('../utils/errors.js');
    throw normalizeError(error);
  }
};

const resolveSkillsShUrl = async (url: string) => {
  const script = path.resolve(
    PROJECT_ROOT,
    'tools/skill-loader-node/examples/resolve-and-dry-run.js',
  );
  const { stdout } = await runCommand(process.execPath, [script, url]);
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('skills.sh resolve returned empty output');
  const parsed = safeParseJSON(trimmed);
  if (!parsed) throw new Error('skills.sh resolve returned invalid JSON');
  return parsed as { repoUrl?: string; subpath?: string; skill?: string };
};

const parseRepoUrl = (repoUrl: string) => {
  const match = repoUrl.match(/github\.com\/(.+?)\/(.+?)(?:\.git)?$/);
  if (!match) return null;
  const owner = match[1];
  const repoRaw = match[2];
  if (!owner || !repoRaw) return null;
  return { owner, repo: repoRaw.replace(/\.git$/, '') };
};

type BackgroundOverviewSnapshot = {
  translationQueued: number;
  auditPending: number;
  vectorizationPending: number;
};

const getVectorizationPendingCount = async (): Promise<number> => {
  const totalSkills = await prisma.skill.count();
  let vectorizedSkills = 0;

  try {
    const { data } = await fetchJSON(`${SKILLSHUB_BASE_URL}/index`);
    if (data?.meta) {
      const metaPath = data.meta.meta_path || 'skills_meta.json';
      const metaFullPath = path.resolve(PROJECT_ROOT, metaPath);
      try {
        const metaContent = await fs.readFile(metaFullPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        vectorizedSkills = Array.isArray(meta) ? meta.length : Object.keys(meta).length;
      } catch {
        vectorizedSkills = 0;
      }
    }
  } catch {
    vectorizedSkills = 0;
  }

  return Math.max(0, totalSkills - vectorizedSkills);
};

const getBackgroundOverviewSnapshot = async (): Promise<BackgroundOverviewSnapshot> => {
  const [translationQueued, totalSkills, uniqueAuditedSkills, vectorizationPending] =
    await Promise.all([
      prisma.translationJob.count({ where: { status: { in: ['queued', 'retry'] } } as any }),
      prisma.skill.count(),
      prisma.auditReport.groupBy({ by: ['skill_id'] }),
      getVectorizationPendingCount(),
    ]);

  const auditPending = Math.max(0, totalSkills - uniqueAuditedSkills.length);

  return {
    translationQueued,
    auditPending,
    vectorizationPending,
  };
};

router.post('/sync/all-skills-sh', requireAdmin, async (_req: AuthRequest, res) => {
  const jobId = syncJobManager.createJob();
  res.json({ status: 'accepted', jobId });

  (async () => {
    try {
      const beforeSnapshot = await getBackgroundOverviewSnapshot();
      syncJobManager.addLog(jobId, 'system', 'Starting full sync from skills.sh...');

      let allRepos = new Set<string>();
      const failureLogPath = path.resolve(PROJECT_ROOT, 'sync_failures.json');
      const appendFailure = async (
        repo: string,
        error: string,
        details?: { stdout?: string; stderr?: string },
      ) => {
        try {
          let failures = [];
          try {
            const data = await fs.readFile(failureLogPath, 'utf-8');
            failures = safeParseJSON(data, []);
          } catch {}
          failures.push({
            repo,
            error,
            timestamp: new Date().toISOString(),
            stdout: details?.stdout || undefined,
            stderr: details?.stderr || undefined,
          });
          if (failures.length > 1000) {
            failures = failures.slice(-1000);
          }
          await fs.writeFile(failureLogPath, JSON.stringify(failures, null, 2));
        } catch (e) {
          console.error('Failed to write failure log:', e);
        }
      };

      syncJobManager.addLog(
        jobId,
        'system',
        'Collecting repositories from skills.sh all-time catalog (paged API)...',
      );

      let page = 1;
      let hasMore = true;
      const maxPages = 2000;
      let totalSkillsSeen = 0;

      while (hasMore && page <= maxPages) {
        const url = `https://skills.sh/api/skills/all-time/${page}`;
        const { data, ok, status } = await fetchJSON(url);
        if (!ok) {
          syncJobManager.addLog(
            jobId,
            'system',
            `Failed to fetch all-time page ${page}: Status ${status}`,
          );
          break;
        }

        const typedData = data as {
          skills?: any[];
          hasMore?: boolean;
          total?: number;
          allTimeTotal?: number;
        };

        const skills = Array.isArray(typedData.skills) ? typedData.skills : [];
        if (skills.length === 0) {
          syncJobManager.addLog(jobId, 'system', `All-time page ${page} is empty. Stopping.`);
          break;
        }

        for (const s of skills) {
          const repo = typeof s?.source === 'string' ? s.source : s?.topSource;
          if (typeof repo === 'string' && repo.includes('/')) {
            allRepos.add(repo);
          }
        }

        totalSkillsSeen += skills.length;
        if (page === 1) {
          const totalHint = typedData.allTimeTotal ?? typedData.total;
          if (typeof totalHint === 'number') {
            syncJobManager.addLog(
              jobId,
              'system',
              `All-time API reachable. Reported total skills: ${totalHint}.`,
            );
          }
        }

        if (page % 20 === 0 || typedData.hasMore === false) {
          syncJobManager.addLog(
            jobId,
            'system',
            `Collected pages=${page}, skills_seen=${totalSkillsSeen}, unique_repos=${allRepos.size}`,
          );
        }

        hasMore = typedData.hasMore !== false;
        page += 1;
      }

      if (allRepos.size === 0) {
        syncJobManager.addLog(
          jobId,
          'system',
          'All-time API returned no repositories. Falling back to sitemap extraction...',
        );
        try {
          const sitemapUrl = 'https://skills.sh/sitemap.xml';
          const { stdout } = await execAsync(`curl -s -L "${sitemapUrl}"`);
          const urls = stdout.match(/https:\/\/skills\.sh\/[^< ]+/g) || [];
          urls.forEach((url) => {
            const skillPath = url.replace('https://skills.sh/', '');
            if (skillPath.includes('/')) {
              const parts = skillPath.split('/');
              if (parts.length >= 2) {
                allRepos.add(`${parts[0]}/${parts[1]}`);
              }
            }
          });
          syncJobManager.addLog(
            jobId,
            'system',
            `Sitemap fallback extracted ${allRepos.size} repositories.`,
          );
        } catch (err: any) {
          syncJobManager.addLog(jobId, 'system', `Sitemap fallback failed: ${err.message}`);
        }
      }

      const repoList = Array.from(allRepos);
      const totalCount = repoList.length;
      syncJobManager.addLog(
        jobId,
        'system',
        `Found ${totalCount} unique repositories. Starting batch sync...`,
      );

      let currentCount = 0;
      let hasFailures = false;
      const loaderScript = resolveRootPath('tools/skill-loader-node/examples/load-skill.js');
      const venvPython = resolveRootPath('.venv/bin/python3');

      for (const repoPath of repoList) {
        currentCount++;
        const [owner, repo] = repoPath.split('/');

        syncJobManager.emit(`log:${jobId}`, {
          type: 'progress',
          current: currentCount,
          total: totalCount,
        });

        if (!owner || !repo) {
          hasFailures = true;
          continue;
        }

        syncJobManager.addLog(
          jobId,
          'system',
          `[${currentCount}/${totalCount}] Syncing ${owner}/${repo}...`,
        );

        const repoDirName = `${owner}__${repo}`;
        const repoPathOnDisk = path.resolve(PROJECT_ROOT, 'external_skills', repoDirName);

        try {
          const stat = await fs.stat(repoPathOnDisk);
          if (stat.isDirectory()) {
            syncJobManager.addLog(
              jobId,
              'system',
              `Skipping ${owner}/${repo}: Repository already exists in external_skills.`,
            );
            continue;
          }
        } catch (e) {}

        try {
          await syncJobManager.runCommand(
            jobId,
            process.execPath,
            [
              loaderScript,
              '--owner',
              owner,
              '--repo',
              repo,
              '--skills-dir',
              resolveRootPath('external_skills'),
            ],
            PROJECT_ROOT,
          );
        } catch (e: any) {
          syncJobManager.addLog(jobId, 'system', `Sync failed for ${owner}/${repo}: ${e.message}`);
          await appendFailure(`${owner}/${repo}`, e.message, {
            stdout: e?.stdout,
            stderr: e?.stderr,
          });
          hasFailures = true;
        }
      }

      if (totalCount > 0) {
        syncJobManager.addLog(
          jobId,
          'system',
          'Collection finished. Running single registry import to enqueue async post-process tasks...',
        );
        try {
          const registryScript = resolveRootPath('tools/register_skills.py');
          await syncJobManager.runCommand(jobId, venvPython, [registryScript], PROJECT_ROOT);
          syncJobManager.addLog(
            jobId,
            'system',
            'Registry import completed. Translation/security/vector jobs are handled asynchronously by backend workers.',
          );
        } catch (e: any) {
          syncJobManager.addLog(jobId, 'system', `Registry import failed: ${e.message}`);
          await appendFailure('register_skills.py', e.message, {
            stdout: e?.stdout,
            stderr: e?.stderr,
          });
          hasFailures = true;
        }
      }

      const apiKey = process.env.SKILLSHUB_API_KEY;
      if (apiKey) {
        syncJobManager.addLog(
          jobId,
          'system',
          'Finalizing: Queueing vector index rebuild (async)...',
        );
        void fetch(`${SKILLSHUB_BASE_URL}/index/rebuild`, {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey },
        })
          .then(() => {
            syncJobManager.addLog(jobId, 'system', 'Vector index rebuild request submitted.');
          })
          .catch((err: any) => {
            syncJobManager.addLog(
              jobId,
              'system',
              `Vector index rebuild trigger failed: ${err?.message || err}`,
            );
          });
      }

      const afterSnapshot = await getBackgroundOverviewSnapshot();
      const summary = {
        translationQueuedAdded: Math.max(
          0,
          afterSnapshot.translationQueued - beforeSnapshot.translationQueued,
        ),
        auditPendingAdded: Math.max(0, afterSnapshot.auditPending - beforeSnapshot.auditPending),
        vectorizationPendingAdded: Math.max(
          0,
          afterSnapshot.vectorizationPending - beforeSnapshot.vectorizationPending,
        ),
      };
      syncJobManager.setPostProcessSummary(jobId, summary);
      syncJobManager.addLog(
        jobId,
        'system',
        `Post-process overview: translation +${summary.translationQueuedAdded}, audit pending +${summary.auditPendingAdded}, vector pending +${summary.vectorizationPendingAdded}`,
      );

      syncJobManager.completeJob(jobId, !hasFailures);
    } catch (error: any) {
      console.error('Full Sync Error:', error);
      syncJobManager.addLog(jobId, 'system', `Full sync failed: ${error.message}`);
      syncJobManager.completeJob(jobId, false);
    }
  })();
});

router.post('/sync', requireAdmin, async (req: AuthRequest, res) => {
  const body = req.body ?? {};
  const syncItems = Array.isArray(body) ? body : [body];

  const jobId = syncJobManager.createJob();
  res.json({ status: 'accepted', jobId });

  (async () => {
    try {
      const beforeSnapshot = await getBackgroundOverviewSnapshot();
      const failureLogPath = path.resolve(PROJECT_ROOT, 'sync_failures.json');
      const appendFailure = async (
        repo: string,
        error: string,
        details?: { stdout?: string; stderr?: string },
      ) => {
        try {
          let failures = [];
          try {
            const data = await fs.readFile(failureLogPath, 'utf-8');
            failures = safeParseJSON(data, []);
          } catch {}
          failures.push({
            repo,
            error,
            timestamp: new Date().toISOString(),
            stdout: details?.stdout || undefined,
            stderr: details?.stderr || undefined,
          });
          // Limit to last 1000 failures to prevent file bloat
          if (failures.length > 1000) {
            failures = failures.slice(-1000);
          }
          await fs.writeFile(failureLogPath, JSON.stringify(failures, null, 2));
        } catch (e) {
          console.error('Failed to write failure log:', e);
        }
      };

      let current = 0;
      const total = syncItems.length;
      let hasFailures = false;

      for (const item of syncItems) {
        current++;
        syncJobManager.emit(`log:${jobId}`, {
          type: 'progress',
          current,
          total,
        });

        const { source, url, owner, repo, ref, rebuildIndex } = item;
        let resolvedOwner = owner;
        let resolvedRepo = repo;

        if (source === 'skills.sh') {
          if (!url || typeof url !== 'string') {
            syncJobManager.addLog(jobId, 'system', `Skipping invalid skills.sh item (missing URL)`);
            hasFailures = true;
            continue;
          }
          syncJobManager.addLog(jobId, 'system', `Resolving skills.sh URL: ${url}`);
          try {
            const resolved = await resolveSkillsShUrl(url);
            if (!resolved?.repoUrl) {
              syncJobManager.addLog(jobId, 'system', `Failed to resolve skills.sh URL: ${url}`);
              hasFailures = true;
              continue;
            }
            const parsed = parseRepoUrl(resolved.repoUrl);
            if (!parsed) {
              syncJobManager.addLog(
                jobId,
                'system',
                `Invalid repo URL from skills.sh: ${resolved.repoUrl}`,
              );
              hasFailures = true;
              continue;
            }
            resolvedOwner = parsed.owner;
            resolvedRepo = parsed.repo;
          } catch (e: any) {
            syncJobManager.addLog(jobId, 'system', `Error resolving ${url}: ${e.message}`);
            hasFailures = true;
            continue;
          }
        }

        if (!resolvedOwner || !resolvedRepo) {
          syncJobManager.addLog(jobId, 'system', `Skipping item: missing owner/repo.`);
          hasFailures = true;
          continue;
        }

        syncJobManager.addLog(
          jobId,
          'system',
          `Starting sync for ${resolvedOwner}/${resolvedRepo}`,
        );

        const loaderScript = resolveRootPath('tools/skill-loader-node/examples/load-skill.js');
        const venvPython = resolveRootPath('.venv/bin/python3');

        const args = [
          loaderScript,
          '--owner',
          resolvedOwner,
          '--repo',
          resolvedRepo,
          '--skills-dir',
          resolveRootPath('external_skills'),
        ];
        if (ref) args.push('--ref', String(ref));

        try {
          await syncJobManager.runCommand(jobId, process.execPath, args, PROJECT_ROOT);
          const registryScript = resolveRootPath('tools/register_skills.py');
          await syncJobManager.runCommand(jobId, venvPython, [registryScript], PROJECT_ROOT);
          syncJobManager.addLog(
            jobId,
            'system',
            'Post-sync tasks queued: translations enqueued to worker queue; security audit handled by background auditor daemon.',
          );
        } catch (e: any) {
          syncJobManager.addLog(
            jobId,
            'system',
            `Sync failed for ${resolvedOwner}/${resolvedRepo}: ${e.message}`,
          );
          await appendFailure(`${resolvedOwner}/${resolvedRepo}`, e.message, {
            stdout: e?.stdout,
            stderr: e?.stderr,
          });
          hasFailures = true;
        }

        if (rebuildIndex) {
          const apiKey = process.env.SKILLSHUB_API_KEY;
          if (apiKey) {
            syncJobManager.addLog(jobId, 'system', `Triggering index rebuild...`);
            const rebuildUrl = `${SKILLSHUB_BASE_URL}/index/rebuild`;
            void fetchJSON(rebuildUrl, {
              method: 'POST',
              headers: { 'X-API-KEY': apiKey },
            })
              .then(({ data, status }) => {
                syncJobManager.addLog(
                  jobId,
                  'system',
                  `Index rebuild queued (Status ${status}): ${JSON.stringify(data)}`,
                );
              })
              .catch((e: any) => {
                syncJobManager.addLog(
                  jobId,
                  'system',
                  `Index rebuild request failed: ${e.message}`,
                );
              });
          }
        }
      }

      const afterSnapshot = await getBackgroundOverviewSnapshot();
      const summary = {
        translationQueuedAdded: Math.max(
          0,
          afterSnapshot.translationQueued - beforeSnapshot.translationQueued,
        ),
        auditPendingAdded: Math.max(0, afterSnapshot.auditPending - beforeSnapshot.auditPending),
        vectorizationPendingAdded: Math.max(
          0,
          afterSnapshot.vectorizationPending - beforeSnapshot.vectorizationPending,
        ),
      };
      syncJobManager.setPostProcessSummary(jobId, summary);
      syncJobManager.addLog(
        jobId,
        'system',
        `Post-process overview: translation +${summary.translationQueuedAdded}, audit pending +${summary.auditPendingAdded}, vector pending +${summary.vectorizationPendingAdded}`,
      );

      syncJobManager.completeJob(jobId, !hasFailures);
    } catch (error: any) {
      console.error('Batch Sync Job Error:', error);
      syncJobManager.addLog(jobId, 'system', `Batch sync failed: ${error.message}`);
      syncJobManager.completeJob(jobId, false);
    }
  })();
});

router.get('/sync/summary/:jobId', requireAdmin, async (req: AuthRequest, res) => {
  const { jobId } = req.params;
  const job = syncJobManager.getJob(String(jobId));
  if (!job) {
    return res.status(404).json({ code: '404.JOB_NOT_FOUND' });
  }

  if (!job.postProcessSummary) {
    return res.status(202).json({
      status: job.status,
      message: 'Summary not ready yet',
    });
  }

  return res.json({
    status: job.status,
    summary: job.postProcessSummary,
  });
});

router.post(
  '/manual-import',
  requireAdmin,
  upload.single('file'),
  async (req: AuthRequest, res) => {
    console.log('[ManualImport] Request received');
    const body: any = req.body ?? {};
    const file: any = (req as any).file;

    const owner = body.owner ? String(body.owner) : undefined;
    const repo = body.repo ? String(body.repo) : undefined;
    const source = body.source ? String(body.source) : 'manual';
    const rebuildIndex = parseBooleanFlag(body.rebuildIndex);

    console.log(`[ManualImport] Params: owner=${owner}, repo=${repo}, file=${file?.originalname}`);

    if (!owner || !repo) {
      return res.status(400).json({
        code: '400.MISSING_FIELDS',
        message: 'owner and repo are required',
      });
    }

    // Parse manifest from JSON body (application/json) or from multipart form fields.
    let manifest: any = parseManifestFromRequestBody(body);
    let resolvedSkillPath: string | undefined = body.skill_path
      ? String(body.skill_path)
      : undefined;

    // If a file is uploaded, extract/move it under external_skills/manual_uploads/{uuid}/
    if (file) {
      const uploadId = uuidv4();
      const destDir = path.resolve(MANUAL_UPLOADS_DIR, uploadId);

      try {
        // Ensure required directories exist.
        await fs.mkdir(MANUAL_UPLOADS_DIR, { recursive: true });
        await fs.mkdir(destDir, { recursive: true });
        // Multer uses a relative temp dir: ensure it exists.
        await fs.mkdir(path.resolve(process.cwd(), 'uploads'), { recursive: true });

        const originalName = file?.originalname || '';
        const mimetype = file?.mimetype || '';
        const lower = originalName.toLowerCase();

        const isZip =
          lower.endsWith('.zip') || mimetype.includes('zip') || mimetype.includes('compressed');

        const isTarGz =
          lower.endsWith('.tar.gz') ||
          lower.endsWith('.tgz') ||
          mimetype.includes('tar') ||
          mimetype.includes('gzip') ||
          mimetype.includes('tgz') ||
          mimetype === 'application/octet-stream';

        if (isTarGz) {
          // Use generic 'tar' available in PATH; on some systems /usr/bin/tar may not exist.
          const tarCmd = 'tar';
          console.log(`[ManualImport] Extracting tar.gz with ${tarCmd} to ${destDir}`);
          await runCommand(tarCmd, ['-xzf', path.resolve(file.path), '-C', destDir]);
        } else if (isZip) {
          await safeExtractZipToDir(path.resolve(file.path), destDir);
        } else {
          const safeName =
            originalName && !originalName.includes(path.sep) ? originalName : 'upload';
          const targetPath = path.resolve(destDir, safeName);
          await fs.rename(path.resolve(file.path), targetPath);
        }

        const skillMdPath = await findFirstFileNamed(destDir, 'SKILL.md');

        if (!skillMdPath) {
          console.error(`[ManualImport] SKILL.md not found in ${destDir}. Contents:`);
          try {
            const contents = await fs.readdir(destDir, { recursive: true } as any);
            console.error(JSON.stringify(contents));
          } catch (e: any) {
            console.error(`[ManualImport] Failed to readdir: ${e.message}`);
          }

          return res.status(400).json({
            code: '400.SKILL_MD_NOT_FOUND',
            message: 'Uploaded archive did not contain SKILL.md',
          });
        }

        console.log(`[ManualImport] Found SKILL.md at ${skillMdPath}`);

        // Use SKILL.md frontmatter as defaults if form fields didn't provide them.
        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const fm = parseSkillMdFrontmatter(content);
          manifest = mergeManifestDefaults(manifest, fm);
        } catch (e: any) {
          // If reading/parsing fails, we still can proceed with provided fields.
          console.warn(`Failed to read/parse SKILL.md frontmatter: ${e.message}`);
        }

        // Ensure tags become an array if present.
        if (!Array.isArray(manifest.tags) && manifest.tags) {
          manifest.tags = parseTagsField(manifest.tags);
        }

        // Store skill_path pointing to extracted SKILL.md (relative to project root).
        resolvedSkillPath = path.relative(PROJECT_ROOT, skillMdPath).split(path.sep).join('/');
      } catch (error: any) {
        console.error('Manual import file handling failed:', error);
        // Best-effort cleanup of extracted directory
        try {
          await fs.rm(destDir, { recursive: true, force: true });
        } catch {}

        // Best-effort cleanup of temp upload
        try {
          if (file?.path) await fs.unlink(String(file.path));
        } catch {}

        return res.status(400).json({
          code: '400.INVALID_UPLOAD',
          message: error?.message || 'Invalid upload',
        });
      } finally {
        // If we extracted (zip), multer temp file still exists; remove it.
        try {
          if (file?.path) await fs.unlink(String(file.path));
        } catch {}
      }
    }

    // If no file uploaded, preserve previous behavior: require manifest in some form.
    if (!file && (!manifest || Object.keys(manifest).length === 0)) {
      return res.status(400).json({
        code: '400.MISSING_FIELDS',
        message: 'manifest is required when no file is uploaded',
      });
    }

    try {
      const now = new Date();
      const name = (manifest?.name ? String(manifest.name) : '').trim();
      const skillId = `${owner}::${repo}${name ? `::${name}` : ''}`;
      const tags = Array.isArray(manifest?.tags) ? manifest.tags : [];

      const skill = await prisma.skill.upsert({
        where: { id: skillId },
        update: {
          name: name || repo,
          name_zh: manifest?.name_zh,
          description: manifest?.description,
          description_zh: manifest?.description_zh,
          tags: tags.length ? tags.join(',') : '',
          owner,
          contact: manifest?.contact,
          source,
          skill_path: resolvedSkillPath || '',
          updatedAt: now,
        },
        create: {
          id: skillId,
          name: name || repo,
          name_zh: manifest?.name_zh,
          description: manifest?.description,
          description_zh: manifest?.description_zh,
          tags: tags.length ? tags.join(',') : '',
          owner,
          contact: manifest?.contact,
          source,
          skill_path: resolvedSkillPath || '',
          createdAt: now,
          updatedAt: now,
        },
      });

      if (rebuildIndex) {
        const apiKey = process.env.SKILLSHUB_API_KEY;
        if (apiKey) {
          fetch(`${SKILLSHUB_BASE_URL}/index/rebuild`, {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey },
          }).catch((err) => console.error('Manual import index rebuild failed:', err));
        }
      }

      res.json({ status: 'success', skill });
    } catch (error: any) {
      console.error('Manual import failed:', error);
      res.status(500).json({ code: '500.DATABASE_ERROR', message: error.message });
    }
  },
);

router.post('/index/rebuild', requireAdmin, async (_req, res) => {
  const apiKey = process.env.SKILLSHUB_API_KEY;
  const venvPython = path.resolve(PROJECT_ROOT, '.venv/bin/python3');
  const registryScript = path.resolve(PROJECT_ROOT, 'tools/register_skills.py');

  try {
    // 1. First update the database metadata and security scores
    console.log('[Index] Running local registration script...');
    try {
      await execFileAsync(venvPython, [registryScript], { cwd: PROJECT_ROOT });
    } catch (e: any) {
      console.warn(`[Index] Local registration script warning: ${e.message}`);
      // Continue anyway, maybe the script failed but we can still try to rebuild the index
    }

    // 2. Then trigger the remote index rebuild
    if (!apiKey) {
      console.error('[Index] SKILLSHUB_API_KEY missing in environment');
      return res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'API key missing' });
    }

    const rebuildUrl = `${SKILLSHUB_BASE_URL}/index/rebuild`;
    console.log(`[Index] Triggering rebuild at: ${rebuildUrl}`);

    const { data, status } = await fetchJSON(rebuildUrl, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey },
    });

    console.log(`[Index] Rebuild response status: ${status}`);
    res.status(status).json(data);
  } catch (error: any) {
    console.error(`[Index] Rebuild request failed: ${error.message}`);
    res.status(502).json({ code: '502.SKILLSHUB_UNAVAILABLE' });
  }
});

router.post('/index/update', requireAdmin, async (_req, res) => {
  const apiKey = process.env.SKILLSHUB_API_KEY;
  const venvPython = path.resolve(PROJECT_ROOT, '.venv/bin/python3');
  const registryScript = path.resolve(PROJECT_ROOT, 'tools/register_skills.py');

  try {
    console.log('[Index] Running local registration script...');
    try {
      await execFileAsync(venvPython, [registryScript], { cwd: PROJECT_ROOT });
    } catch (e: any) {
      console.warn(`[Index] Local registration script warning: ${e.message}`);
    }

    if (!apiKey) {
      console.error('[Index] SKILLSHUB_API_KEY missing in environment');
      return res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'API key missing' });
    }

    const updateUrl = `${SKILLSHUB_BASE_URL}/index/update`;
    console.log(`[Index] Triggering update at: ${updateUrl}`);

    const { data, status } = await fetchJSON(updateUrl, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey },
    });

    console.log(`[Index] Update response status: ${status}`);
    res.status(status).json(data);
  } catch (error: any) {
    console.error(`[Index] Update request failed: ${error.message}`);
    res.status(502).json({ code: '502.SKILLSHUB_UNAVAILABLE' });
  }
});

router.get('/sync/failures', requireAdmin, async (_req, res) => {
  const failureLogPath = path.resolve(PROJECT_ROOT, 'sync_failures.json');
  try {
    const data = await fs.readFile(failureLogPath, 'utf-8');
    res.json(safeParseJSON(data, []));
  } catch (e) {
    res.json([]);
  }
});

router.post('/:id/translate', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params['id'] as string;
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });

    const targetLangs: string[] = Array.isArray(req.body?.target_langs)
      ? req.body.target_langs
      : ['zh'];
    const modules: string[] = Array.isArray(req.body?.modules)
      ? req.body.modules
      : ['content', 'name', 'description', 'install_guide', 'prompt_templates'];

    const jobs = [] as any[];
    for (const lang of targetLangs) {
      for (const module of modules) {
        let payload: any = { type: module, targetLang: lang };
        if (module === 'content') {
          payload.text = req.body?.content || null;
          if (!payload.text && skill.skill_path) {
            const absolutePath = getSkillAbsolutePath(skill.skill_path)!;
            try {
              payload.text = await fs.readFile(absolutePath, 'utf-8');
            } catch {}
          }
        } else if (module === 'name' || module === 'description') {
          const val = (skill as any)[module] || '';
          if (typeof val === 'string' && val.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(val);
              payload.text =
                parsed.en || parsed.text || (typeof parsed === 'string' ? parsed : val);
            } catch {
              payload.text = val;
            }
          } else {
            payload.text = val;
          }
        } else if ((skill as any)[module]) {
          payload.data = safeParseJSON((skill as any)[module]);
        }

        const jobId = `job_${id}_${module}_${lang}`;
        console.log(`[Translate] Enqueueing module ${module} for ${id} (JobID: ${jobId})`);
        // Skip name/description if module refers to base fields but skill has no values
        if ((module === 'name' || module === 'description') && !(skill as any)[module]) {
          console.log(`[Translate] Skipping empty ${module} for ${id}`);
          continue;
        }
        const job = await prisma.translationJob.upsert({
          where: { id: jobId },
          update: {
            payload: JSON.stringify(payload),
            status: 'queued',
            attempts: 0,
            updatedAt: new Date(),
          },
          create: {
            id: jobId,
            skill_id: id,
            target_lang: String(lang),
            source_lang: 'en',
            payload_type: String(module),
            payload: JSON.stringify(payload),
            status: 'queued',
          },
        });
        jobs.push(job);
      }
    }

    res.json({ status: 'queued', jobs });
  } catch (error) {
    console.error('Failed to enqueue translation jobs:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    res.status(500).json({
      code: '500.DATABASE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown',
    });
  }
});

router.post('/translate/detect', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const skills = await prisma.skill.findMany();
    let enqueuedCount = 0;
    const targetLang = 'zh';

    for (const skill of skills) {
      const modulesToTranslate: string[] = [];

      if (!skill.name_zh) {
        modulesToTranslate.push('name');
      }

      if (!skill.description_zh) {
        modulesToTranslate.push('description');
      }

      let hasContentZh = false;
      if (skill.content_i18n) {
        const i18n = safeParseJSON(skill.content_i18n, {});
        if (i18n.zh) hasContentZh = true;
      }

      if (!hasContentZh && skill.skill_path) {
        const absolutePath = getSkillAbsolutePath(skill.skill_path);
        if (absolutePath) {
          const dir = path.dirname(absolutePath);
          const zhPath = path.join(dir, 'SKILL_zh.md');
          try {
            await fs.access(zhPath);
            hasContentZh = true;
          } catch {}
        }
      }

      if (!hasContentZh) {
        modulesToTranslate.push('content');
      }

      if (skill.install_guide) {
        const ig = safeParseJSON(skill.install_guide, {});
        if (!ig.zh && Object.keys(ig).length > 0) {
          modulesToTranslate.push('install_guide');
        }
      }

      if (skill.prompt_templates) {
        const pt = safeParseJSON(skill.prompt_templates, {});
        if (!pt.zh && Object.keys(pt).length > 0) {
          modulesToTranslate.push('prompt_templates');
        }
      }

      if (modulesToTranslate.length > 0) {
        for (const module of modulesToTranslate) {
          const existingJob = await prisma.translationJob.findFirst({
            where: {
              skill_id: skill.id,
              payload_type: module,
              target_lang: targetLang,
              status: { in: ['queued', 'processing'] },
            },
          });

          if (existingJob) continue;

          let payload: any = { type: module, targetLang };
          if (module === 'content') {
            if (skill.skill_path) {
              const absolutePath = getSkillAbsolutePath(skill.skill_path)!;
              try {
                payload.text = await fs.readFile(absolutePath, 'utf-8');
              } catch {}
            }
          } else if (module === 'name' || module === 'description') {
            const val = (skill as any)[module] || '';
            if (typeof val === 'string' && val.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(val);
                payload.text =
                  parsed.en || parsed.text || (typeof parsed === 'string' ? parsed : val);
              } catch {
                payload.text = val;
              }
            } else {
              payload.text = val;
            }
          } else if ((skill as any)[module]) {
            payload.data = safeParseJSON((skill as any)[module]);
          }

          if ((module === 'name' || module === 'description') && !(skill as any)[module]) {
            continue;
          }

          const jobId = `job_${skill.id}_${module}_${targetLang}`;
          await prisma.translationJob.upsert({
            where: { id: jobId },
            update: {
              payload: JSON.stringify(payload),
              status: 'queued',
              attempts: 0,
              updatedAt: new Date(),
            },
            create: {
              id: jobId,
              skill_id: skill.id,
              target_lang: targetLang,
              source_lang: 'en',
              payload_type: module,
              payload: JSON.stringify(payload),
              status: 'queued',
            },
          });
          enqueuedCount++;
        }
      }
    }

    res.json({
      status: 'success',
      totalSkills: skills.length,
      enqueuedCount,
      checkedCount: skills.length,
    });
  } catch (error) {
    console.error('Failed to detect and enqueue translations:', error);
    res.status(500).json({
      code: '500.DATABASE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown',
    });
  }
});

router.get('/:id/translation-jobs', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params['id'] as string;
    const jobs = await prisma.translationJob.findMany({
      // @ts-ignore
      where: { skill_id: id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ jobs });
  } catch (error) {
    console.error('Failed to fetch translation jobs:', error);
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.get('/:id/files', async (req, res) => {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: req.params.id },
    });

    if (!skill || !skill.skill_path) {
      return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });
    }

    const absolutePath = path.isAbsolute(skill.skill_path)
      ? skill.skill_path
      : path.resolve(PROJECT_ROOT, skill.skill_path.replace(/^projects\/skillsmcp\//, ''));
    const skillDir = path.dirname(absolutePath);
    const normalizedSkillDir =
      path.normalize(skillDir) + (skillDir.endsWith(path.sep) ? '' : path.sep);

    const relativePath = (req.query.path as string) || '';
    const targetDir = path.resolve(skillDir, relativePath);
    const normalizedTargetDir = path.normalize(targetDir);

    // Security check: ensure targetDir is within skillDir
    if (
      !normalizedTargetDir.startsWith(normalizedSkillDir) &&
      normalizedTargetDir !== path.normalize(skillDir)
    ) {
      return res.status(403).json({ code: '403.FORBIDDEN' });
    }

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        isDirectory: entry.isDirectory(),
        path: path.join(relativePath, entry.name),
      }));
      res.json({ files });
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return res.status(404).json({ code: '404.DIRECTORY_NOT_FOUND' });
      }
      // Normalize non-Error throws before rethrowing so logging is consistent
      // and stack traces are preserved where possible.
      const { normalizeError } = await import('../utils/errors.js');
      throw normalizeError(e);
    }
  } catch (error) {
    console.error('Failed to list skill files:', error);
    res.status(500).json({ code: '500.INTERNAL_ERROR' });
  }
});

router.get('/:id/file', async (req, res) => {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: req.params.id },
    });

    if (!skill || !skill.skill_path) {
      return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });
    }

    const absolutePath = path.isAbsolute(skill.skill_path)
      ? skill.skill_path
      : path.resolve(PROJECT_ROOT, skill.skill_path.replace(/^projects\/skillsmcp\//, ''));
    const skillDir = path.dirname(absolutePath);
    const normalizedSkillDir =
      path.normalize(skillDir) + (skillDir.endsWith(path.sep) ? '' : path.sep);

    const filePath = (req.query.path as string) || '';
    if (!filePath) {
      return res.status(400).json({ code: '400.MISSING_PATH' });
    }

    const targetFile = path.resolve(skillDir, filePath);
    const normalizedTargetFile = path.normalize(targetFile);

    // Security check: ensure targetFile is within skillDir
    if (!normalizedTargetFile.startsWith(normalizedSkillDir)) {
      return res.status(403).json({ code: '403.FORBIDDEN' });
    }

    try {
      const content = await fs.readFile(targetFile, 'utf-8');
      res.json({ content });
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return res.status(404).json({ code: '404.FILE_NOT_FOUND' });
      }
      const { normalizeError } = await import('../utils/errors.js');
      throw normalizeError(e);
    }
  } catch (error) {
    console.error('Failed to read skill file:', error);
    res.status(500).json({ code: '500.INTERNAL_ERROR' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: req.params.id },
    });

    if (!skill) {
      return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });
    }

    let content = null;
    let content_zh = null;
    const content_i18n: Record<string, string> = {};
    let file_exists = false;

    if (skill.skill_path) {
      const absolutePath = path.isAbsolute(skill.skill_path)
        ? skill.skill_path
        : path.resolve(PROJECT_ROOT, skill.skill_path.replace(/^projects\/skillsmcp\//, ''));
      try {
        // Use stat to determine if the skill_path points to a file or directory.
        const st = await fs.stat(absolutePath);
        if (st.isDirectory()) {
          // Directory exists - allow browsing. Mark file_exists = true to indicate source folder exists.
          file_exists = true;

          // Try reading SKILL.md inside the directory
          const skillMd = path.join(absolutePath, 'SKILL.md');
          try {
            content = await fs.readFile(skillMd, 'utf-8');
            content_i18n.en = content;
          } catch (e) {
            // reading SKILL.md failed - leave content null so DB content_i18n can be used as fallback
          }

          // Try reading SKILL_zh.md inside the directory
          const skillMdZh = path.join(absolutePath, 'SKILL_zh.md');
          try {
            content_zh = await fs.readFile(skillMdZh, 'utf-8');
            content_i18n.zh = content_zh;
          } catch {}
        } else if (st.isFile()) {
          // Path points to a file - attempt to read it and treat as primary content
          try {
            content = await fs.readFile(absolutePath, 'utf-8');
            content_i18n.en = content;
            file_exists = true;
          } catch (e) {
            // Could not read file - leave file_exists false (or keep false)
            console.error(`Skill file exists but could not be read: ${absolutePath}`, e);
          }

          // Also check for SKILL_zh.md next to the file
          const dir = path.dirname(absolutePath);
          const zhPath = path.join(dir, 'SKILL_zh.md');
          try {
            content_zh = await fs.readFile(zhPath, 'utf-8');
            content_i18n.zh = content_zh;
          } catch {}
        }
      } catch (e: any) {
        // stat failed -> path doesn't exist or inaccessible. Do not set file_exists.
        if (e && e.code !== 'ENOENT') {
          console.error(`Skill file missing or inaccessible: ${absolutePath}`, e);
        }
      }
    }

    let content_i18n_parsed = safeParseJSON(skill.content_i18n, content_i18n);
    const final_content_i18n = { ...content_i18n_parsed, ...content_i18n };

    // Fallback: if content is null but content_i18n has it, use that.
    if (!content && final_content_i18n.en) {
      content = final_content_i18n.en;
    }
    if (!content_zh && final_content_i18n.zh) {
      content_zh = final_content_i18n.zh;
    }

    res.json({
      ...skill,
      tags: skill.tags ? skill.tags.split(',').map((t) => t.trim()) : [],
      security_data: safeParseJSON(skill.security_data),
      quality_data: safeParseJSON(skill.quality_data),
      risk_data: safeParseJSON(skill.risk_data),
      install_guide: safeParseJSON(skill.install_guide),
      prompt_templates: safeParseJSON(skill.prompt_templates),
      use_cases: safeParseJSON(skill.use_cases),
      best_practices: safeParseJSON(skill.best_practices),
      avoid: safeParseJSON(skill.avoid),
      faq: safeParseJSON(skill.faq),
      test_it: safeParseJSON(skill.test_it),
      content_i18n: final_content_i18n,
      module_overrides: safeParseJSON(skill.module_overrides),
      updated_at: skill.updatedAt.toISOString(),
      content,
      content_zh,
      file_exists,
    });
  } catch (error) {
    console.error('Failed to fetch skill details:', error);
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.put('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params['id'] as string;
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });

    const body = req.body ?? {};
    const fields: Record<string, any> = {};
    const jsonFields = [
      'module_overrides',
      'prompt_templates',
      'use_cases',
      'best_practices',
      'avoid',
      'faq',
      'install_guide',
      'test_it',
      'quality_data',
      'risk_data',
      'content_i18n',
    ];

    for (const key of jsonFields) {
      if (body[key] !== undefined) {
        fields[key] = JSON.stringify(body[key]);
      }
    }

    if (body.quality_score !== undefined) {
      const score = Number(body.quality_score);
      fields.quality_score = Number.isFinite(score) ? score : null;
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ code: '400.NO_UPDATES' });
    }

    const updated = await prisma.skill.update({
      // @ts-ignore
      where: { id },
      data: fields,
    });

    res.json({ status: 'updated', skill: updated });
  } catch (error) {
    console.error('Failed to update skill overrides:', error);
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: req.params.id },
    });

    if (!skill || !skill.skill_path) {
      return res.status(404).json({ code: '404.SKILL_NOT_FOUND' });
    }

    const absolutePath = path.isAbsolute(skill.skill_path)
      ? skill.skill_path
      : path.resolve(PROJECT_ROOT, skill.skill_path.replace(/^projects\/skillsmcp\//, ''));
    const skillDir = path.dirname(absolutePath);

    try {
      await fs.access(skillDir);
    } catch (e) {
      return res.status(404).json({ code: '404.SKILL_DIR_NOT_FOUND' });
    }

    res.attachment(`${skill.id.replace(/::/g, '_')}.zip`);

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(skillDir, false);
    await archive.finalize();
  } catch (error) {
    console.error('Failed to download skill:', error);
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

export default router;
