import { Router } from 'express';
import fs from 'node:fs/promises';
import { createWriteStream, openSync } from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ProxyAgent } from 'undici';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import prisma from '../db.js';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate PROJECT_ROOT relative to repository root.
// Calculate PROJECT_ROOT relative to repository root.
const PROJECT_ROOT = ((): string => {
  const parts = __dirname.split(path.sep);
  const apiIdx = parts.lastIndexOf('api');
  if (apiIdx !== -1) {
    return parts.slice(0, apiIdx).join(path.sep) || path.sep;
  }
  return path.resolve(process.cwd());
})();

const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'tools', 'security_auditor.py');
const TRANSLATION_CONFIG_PATH = path.resolve(PROJECT_ROOT, 'api', 'translation', 'config.json');
const LOGS_DIR = path.resolve(PROJECT_ROOT, 'logs');

router.use(authenticateToken);

const adminOnly = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: '403.FORBIDDEN', message: 'Admin access required' });
  }
  next();
};

router.get('/security', adminOnly, async (_req, res) => {
  try {
    const config = await (prisma as any).systemConfig.findUnique({
      where: { key: 'security_llm_config' },
    });
    res.json(config ? JSON.parse(config.value) : { provider: 'openai', model: 'gpt-4' });
  } catch (error) {
    // Normalize the error for consistent logging if a non-Error was thrown
    const { normalizeError } = await import('../utils/errors.js');
    const e = normalizeError(error);
    console.error('Failed to fetch security config:', e);
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to fetch security config' });
  }
});

router.put('/security', adminOnly, async (req, res) => {
  try {
    const config = req.body;
    await (prisma as any).systemConfig.upsert({
      where: { key: 'security_llm_config' },
      update: { value: JSON.stringify(config) },
      create: { key: 'security_llm_config', value: JSON.stringify(config) },
    });
    res.json({ success: true });
  } catch (error) {
    const { normalizeError } = await import('../utils/errors.js');
    const e = normalizeError(error);
    console.error('Failed to save security config:', e);
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to save security config' });
  }
});

router.get('/search-engine', adminOnly, async (_req, res) => {
  try {
    const config = await (prisma as any).systemConfig.findUnique({
      where: { key: 'global_search_engine' },
    });
    res.json(
      config
        ? JSON.parse(config.value)
        : {
            engine: 'auto',
            use_gpu: false,
            vectorized_fields: ['name', 'description', 'excerpt'],
          },
    );
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to fetch search engine config' });
  }
});

router.put('/search-engine', adminOnly, async (req, res) => {
  try {
    const { engine, use_gpu, vectorized_fields } = req.body;
    if (engine && !['auto', 'tfidf', 'sbert', 'hybrid'].includes(engine)) {
      return res
        .status(400)
        .json({ code: '400.INVALID_ENGINE', message: 'Invalid search engine type' });
    }

    const existing = await (prisma as any).systemConfig.findUnique({
      where: { key: 'global_search_engine' },
    });
    const existingValue = existing
      ? JSON.parse(existing.value)
      : { engine: 'auto', use_gpu: false, vectorized_fields: ['name', 'description', 'excerpt'] };

    const cfg = {
      engine: engine || existingValue.engine,
      use_gpu: use_gpu !== undefined ? !!use_gpu : existingValue.use_gpu,
      vectorized_fields: Array.isArray(vectorized_fields)
        ? vectorized_fields
        : existingValue.vectorized_fields,
    };

    await (prisma as any).systemConfig.upsert({
      where: { key: 'global_search_engine' },
      update: { value: JSON.stringify(cfg) },
      create: { key: 'global_search_engine', value: JSON.stringify(cfg) },
    });
    res.json({ success: true, ...cfg });
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to save search engine config' });
  }
});
router.post('/security/audit/:skillId', adminOnly, async (req, res) => {
  try {
    const { skillId } = req.params;

    const skill = await (prisma as any).skill.findUnique({ where: { id: String(skillId) } });
    if (!skill) {
      return res.status(404).json({ code: '404.NOT_FOUND', message: 'Skill not found' });
    }

    const pythonProcess = spawn('python3', [SCRIPT_PATH, '--skill_id', String(skillId)]) as any;

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout?.on('data', (data: any) => {
      output += data.toString();
    });

    pythonProcess.stderr?.on('data', (data: any) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code: any) => {
      console.log(`Audit process exited with code ${code}`);
      if (code !== 0) {
        console.error(`Audit error: ${errorOutput}`);
      }
    });

    res.json({ success: true, message: 'Audit triggered' });
  } catch (error) {
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to trigger audit' });
  }
});

router.post('/security/audit-all', adminOnly, async (req, res) => {
  try {
    const pythonProcess = spawn('python3', [SCRIPT_PATH, '--all'], {
      detached: true,
      stdio: 'ignore',
    }) as any;
    pythonProcess.unref();
    res.json({ success: true, message: 'Full audit triggered' });
  } catch (error) {
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to trigger full audit' });
  }
});

router.get('/audit-reports/:skillId', authenticateToken, async (req, res) => {
  try {
    const { skillId } = req.params;
    const reports = await (prisma as any).auditReport.findMany({
      where: { skill_id: String(skillId) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to fetch audit reports' });
  }
});

router.get('/dashboard/stats', authenticateToken, async (_req, res) => {
  const stats: any = {
    translation: {
      total: 0,
      completed: 0,
      queued: 0,
      processing: 0,
      retry: 0,
      failed: 0,
      lastActiveAt: null,
    },
    security: { total: 0, completed: 0, pending: 0, lastActiveAt: null },
    processes: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    // 1. Translation Stats
    try {
      const transStats = await (prisma as any).translationJob.groupBy({
        by: ['status'],
        _count: true,
      });

      const transMap: Record<string, number> = (transStats || []).reduce((acc: any, row: any) => {
        const count = typeof row._count === 'number' ? row._count : row._count?._all || 0;
        acc[row.status] = count;
        return acc;
      }, {});

      stats.translation = {
        ...stats.translation,
        ...transMap,
        total: Object.values(transMap).reduce((sum: number, val: number) => sum + val, 0),
      };

      const lastTrans = await (prisma as any).translationJob.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      });
      if (lastTrans) stats.translation.lastActiveAt = lastTrans.updatedAt;
    } catch (e: any) {
      console.warn('[Dashboard] Translation stats fetch failed:', e.message);
    }

    // 2. Security Audit Stats
    try {
      stats.security.total = await (prisma as any).skill.count();
      const uniqueAuditedSkills = await (prisma as any).auditReport.groupBy({ by: ['skill_id'] });
      stats.security.completed = uniqueAuditedSkills.length;
      stats.security.pending = Math.max(0, stats.security.total - stats.security.completed);

      const lastAudit = await (prisma as any).auditReport.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (lastAudit) stats.security.lastActiveAt = lastAudit.createdAt;
    } catch (e: any) {
      console.warn('[Dashboard] Security stats fetch failed:', e.message);
    }

    // 3. Processes
    try {
      const checkProcess = async (pattern: string) => {
        try {
          const safePattern = `[${pattern[0]}]${pattern.slice(1)}`;
          const { stdout } = await execAsync(`pgrep -f "${safePattern}"`);
          return stdout.trim() ? 'running' : 'stopped';
        } catch {
          return 'stopped';
        }
      };

      stats.processes = await Promise.all([
        (async () => ({
          name: 'Translation Worker',
          status: await checkProcess('translation/worker.ts'),
          command: 'npm run worker:translate --workspace=api',
        }))(),
        (async () => ({
          name: 'Security Auditor',
          status: await checkProcess('tools/security_auditor.py'),
          command: 'python3 tools/security_auditor.py --all',
        }))(),
        (async () => ({
          name: 'Index Service',
          status: await checkProcess('skillshub'),
          command: 'uvicorn tools.skillshub.service:app --port 8001',
        }))(),
      ]);
    } catch (e: any) {
      console.warn('[Dashboard] Process checks failed:', e.message);
    }

    res.json(stats);
  } catch (error: any) {
    console.error('[Dashboard] Unexpected fatal error:', error);
    res.status(500).json({
      code: '500.FATAL',
      message: 'Failed to fetch dashboard stats',
      details: error.message,
    });
  }
});

router.post('/dashboard/processes/start', adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    let command = '';
    let args: string[] = [];
    let cwd = PROJECT_ROOT;

    if (name === 'Translation Worker') {
      command = 'npm';
      args = ['run', 'worker:translate', '--workspace=api'];
    } else if (name === 'Security Auditor') {
      command = 'python3';
      args = ['tools/security_auditor.py', '--all'];
      cwd = path.resolve(PROJECT_ROOT, '..');
    } else if (name === 'Index Service') {
      command = 'uvicorn';
      args = ['tools.skillshub.service:app', '--port', '8001'];
      cwd = path.resolve(PROJECT_ROOT, '..');
    } else {
      return res.status(400).json({ code: '400.INVALID_PROCESS', message: 'Invalid process name' });
    }

    const logFile =
      name === 'Translation Worker'
        ? 'translation_worker.log'
        : name === 'Security Auditor'
          ? 'security_audit.log'
          : 'skillshub.log';
    const logPath = path.join(LOGS_DIR, logFile);
    await fs.mkdir(LOGS_DIR, { recursive: true });

    const fullCommand = `${command} ${args.join(' ')}`;
    const wrappedCommand = `stdbuf -oL -eL ${fullCommand} 2>&1 | awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush() }' >> "${logPath}"`;

    const child = spawn('sh', ['-c', wrappedCommand], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    res.json({ success: true, message: `${name} started` });
  } catch (error) {
    console.error(`[Dashboard] Failed to start ${req.body.name}:`, error);
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to start process' });
  }
});

router.get('/dashboard/logs/:name', adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    let logFile = '';

    if (name === 'Translation Worker') logFile = 'translation_worker.log';
    else if (name === 'Security Auditor') logFile = 'security_audit.log';
    else if (name === 'Index Service') logFile = 'skillshub.log';
    else return res.status(400).json({ message: 'Invalid process name' });

    const logPath = path.join(LOGS_DIR, logFile);

    const possiblePaths: string[] = [
      logPath,
      path.resolve(PROJECT_ROOT, logFile),
      path.resolve(PROJECT_ROOT, 'api', logFile),
      path.resolve(PROJECT_ROOT, '..', logFile),
    ];

    let foundPath = logPath;
    for (const p of possiblePaths) {
      try {
        const stats = await fs.stat(p);
        if (stats.size > 0) {
          foundPath = p;
          break;
        }
      } catch {
        // continue
      }
    }

    const { stdout } = await execAsync(`tail -n 100 "${foundPath}"`);
    res.json({ logs: stdout });
  } catch (error) {
    res.json({ logs: '' });
  }
});

router.post('/dashboard/logs/clear/:name', adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    let logFile = '';
    if (name === 'Translation Worker') logFile = 'translation_worker.log';
    else if (name === 'Security Auditor') logFile = 'security_audit.log';
    else if (name === 'Index Service') logFile = 'skillshub.log';
    else return res.status(400).json({ message: 'Invalid process name' });

    const possiblePaths: string[] = [
      path.join(LOGS_DIR, logFile),
      path.resolve(PROJECT_ROOT, logFile),
      path.resolve(PROJECT_ROOT, 'api', logFile),
      path.resolve(PROJECT_ROOT, '..', logFile),
    ];

    for (const p of possiblePaths) {
      try {
        await fs.writeFile(p, '', 'utf-8');
      } catch {
        // ignore
      }
    }
    res.json({ success: true, message: `Logs for ${name} cleared` });
  } catch (error) {
    console.error(`[Dashboard] Failed to clear logs for ${req.params.name}:`, error);
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to clear logs' });
  }
});

router.post('/dashboard/processes/stop', adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    let pattern = '';

    if (name === 'Translation Worker') {
      pattern = 'translation/worker.ts';
    } else if (name === 'Security Auditor') {
      pattern = 'tools/security_auditor.py';
    } else if (name === 'Index Service') {
      pattern = 'skillshub';
    } else {
      return res.status(400).json({ code: '400.INVALID_PROCESS', message: 'Invalid process name' });
    }

    try {
      const safePattern = `[${pattern[0]}]${pattern.slice(1)}`;
      await execAsync(`pkill -f "${safePattern}"`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      res.json({ success: true, message: `${name} stopped` });
    } catch (e) {
      // pkill returns non-zero if no processes matched
      res.json({ success: true, message: `${name} already stopped or not found` });
    }
  } catch (error) {
    console.error(`[Dashboard] Failed to stop ${req.body.name}:`, error);
    res.status(500).json({ code: '500.INTERNAL_ERROR', message: 'Failed to stop process' });
  }
});

router.post('/security/test', adminOnly, async (req, res) => {
  const { config } = req.body;
  if (!config) return res.status(400).json({ code: '400.MISSING_CONFIG' });

  try {
    const provider = config.provider || 'openai';
    const model = config.model || 'gpt-4';
    const apiKey = resolveApiKey(config.api_key);
    const baseUrl = config.base_url;
    const proxy = config.proxy;

    const prompt = 'Hello! This is a test connection. Please respond with "OK".';

    const openaiCompatible = [
      'openai',
      'qwen',
      'deepseek',
      'siliconflow',
      'groq',
      'openrouter',
      'mistral',
      'xai',
      'custom',
    ];

    const fetchOptions: any = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    if (proxy && typeof proxy === 'string' && proxy.trim()) {
      fetchOptions.dispatcher = new ProxyAgent(proxy.trim());
    }

    let result = '';

    if (openaiCompatible.includes(provider) || provider === 'azure') {
      let url = baseUrl && provider !== 'azure' ? `${baseUrl}/chat/completions` : baseUrl;
      if (!url && provider === 'openai') url = 'https://api.openai.com/v1/chat/completions';
      if (!url) throw new Error(`Missing URL for provider ${provider}`);

      if (provider === 'azure') {
        if (apiKey) fetchOptions.headers['api-key'] = apiKey;
      } else {
        if (apiKey) fetchOptions.headers['Authorization'] = `Bearer ${apiKey}`;
      }

      fetchOptions.body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      });

      const response = await fetch(url, fetchOptions);
      if (!response.ok) throw new Error(`LLM Error: ${response.status} ${await response.text()}`);
      const data = (await response.json()) as any;
      result = String(data.choices[0].message.content).trim();
    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      fetchOptions.body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      });
      const response = await fetch(url, fetchOptions);
      if (!response.ok)
        throw new Error(`Gemini Error: ${response.status} ${await response.text()}`);
      const data = (await response.json()) as any;
      result = String(data.candidates[0].content.parts[0].text).trim();
    } else if (provider === 'anthropic') {
      const url = baseUrl || 'https://api.anthropic.com/v1/messages';
      fetchOptions.headers['x-api-key'] = apiKey || '';
      fetchOptions.headers['anthropic-version'] = '2023-06-01';
      fetchOptions.body = JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const response = await fetch(url, fetchOptions);
      if (!response.ok)
        throw new Error(`Anthropic Error: ${response.status} ${await response.text()}`);
      const data = (await response.json()) as any;
      result = String(data.content[0].text).trim();
    } else if (provider === 'ollama') {
      const url = baseUrl ? `${baseUrl}/api/generate` : 'http://localhost:11434/api/generate';
      fetchOptions.body = JSON.stringify({ model, prompt, stream: false });
      const response = await fetch(url, fetchOptions);
      if (!response.ok)
        throw new Error(`Ollama Error: ${response.status} ${await response.text()}`);
      const data = (await response.json()) as any;
      result = String(data.response).trim();
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ code: '500.TEST_FAILED', message: error.message });
  }
});

router.get('/translation', adminOnly, async (_req, res) => {
  try {
    const content = await fs.readFile(TRANSLATION_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    res.json(config);
  } catch (error) {
    res.json({ engines: [{ type: 'internal' }] });
  }
});

router.put('/translation', adminOnly, async (req, res) => {
  try {
    const config = req.body;
    if (!config || !Array.isArray(config.engines)) {
      return res.status(400).json({ code: '400.INVALID_CONFIG' });
    }

    await fs.mkdir(path.dirname(TRANSLATION_CONFIG_PATH), { recursive: true });
    await fs.writeFile(TRANSLATION_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ code: '500.FILE_ERROR', message: 'Failed to save configuration' });
  }
});

const resolveApiKey = (value?: string) => {
  if (!value) return undefined;
  if (process.env[value]) return process.env[value];
  return value;
};

router.post('/translation/test', adminOnly, async (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ code: '400.MISSING_ENGINE' });

  try {
    if (engine.type === 'llm') {
      const provider = engine.provider || 'openai';
      const model = engine.model || 'gpt-4o';
      const apiKey = resolveApiKey(engine.apiKeyEnv);
      const baseUrl = engine.url;
      const proxy = engine.proxy;

      const prompt = 'Translate "Hello, world!" to Chinese. Return ONLY the translation.';

      const openaiCompatible = [
        'openai',
        'qwen',
        'deepseek',
        'siliconflow',
        'groq',
        'openrouter',
        'mistral',
        'xai',
        'custom',
      ];

      let result = '';

      const fetchOptions: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      if (proxy && typeof proxy === 'string' && proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(proxy.trim());
      }

      if (openaiCompatible.includes(provider) || provider === 'azure') {
        let url = baseUrl && provider !== 'azure' ? `${baseUrl}/chat/completions` : baseUrl;
        if (!url && provider === 'openai') url = 'https://api.openai.com/v1/chat/completions';
        if (!url) throw new Error(`Missing URL for provider ${provider}`);

        if (provider === 'azure') {
          if (apiKey) fetchOptions.headers['api-key'] = apiKey;
        } else {
          if (apiKey) fetchOptions.headers['Authorization'] = `Bearer ${apiKey}`;
        }

        fetchOptions.body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        });

        const response = await fetch(url, fetchOptions);
        if (!response.ok) throw new Error(`LLM Error: ${response.status} ${await response.text()}`);
        const data = (await response.json()) as any;
        result = String(data.choices[0].message.content).trim();
      } else if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        fetchOptions.body = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        });
        const response = await fetch(url, fetchOptions);
        if (!response.ok)
          throw new Error(`Gemini Error: ${response.status} ${await response.text()}`);
        const data = (await response.json()) as any;
        result = String(data.candidates[0].content.parts[0].text).trim();
      } else if (provider === 'anthropic') {
        const url = baseUrl || 'https://api.anthropic.com/v1/messages';
        fetchOptions.headers['x-api-key'] = apiKey || '';
        fetchOptions.headers['anthropic-version'] = '2023-06-01';
        fetchOptions.body = JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        const response = await fetch(url, fetchOptions);
        if (!response.ok)
          throw new Error(`Anthropic Error: ${response.status} ${await response.text()}`);
        const data = (await response.json()) as any;
        result = String(data.content[0].text).trim();
      } else if (provider === 'ollama') {
        const url = baseUrl ? `${baseUrl}/api/generate` : 'http://localhost:11434/api/generate';
        fetchOptions.body = JSON.stringify({ model, prompt, stream: false });
        const response = await fetch(url, fetchOptions);
        if (!response.ok)
          throw new Error(`Ollama Error: ${response.status} ${await response.text()}`);
        const data = (await response.json()) as any;
        result = String(data.response).trim();
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      return res.json({ success: true, result });
    } else if (engine.type === 'http') {
      if (!engine.url) throw new Error('Missing engine URL');

      const apiKey = resolveApiKey(engine.apiKeyEnv);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (engine.apiKeyHeader && apiKey) headers[engine.apiKeyHeader] = apiKey;

      const fetchOptions: any = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: 'Hello, world!',
          source_lang: 'en',
          target_lang: 'zh',
        }),
      };

      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      const response = await fetch(engine.url, fetchOptions);
      if (!response.ok) throw new Error(`Engine returned status ${response.status}`);
      const data = await response.json();
      if (!data?.text) throw new Error('Engine returned invalid response format');

      return res.json({ success: true, result: data.text });
    } else if (engine.type === 'google-free') {
      const params = new URLSearchParams({
        client: 'gtx',
        dt: 't',
        sl: 'en',
        tl: 'zh',
        q: 'Hello, world!',
      });
      const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

      const fetchOptions: any = { method: 'GET' };
      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        throw new Error(`Google Free error: ${response.status}`);
      }
      const data = (await response.json()) as any;
      const translated = data[0]
        .map((s: any) => s[0])
        .join('')
        .trim();
      return res.json({ success: true, result: translated });
    } else if (engine.type === 'bing-free') {
      const authFetchOptions: any = { method: 'GET' };
      if (engine.proxy) {
        authFetchOptions.dispatcher = new ProxyAgent(engine.proxy);
      }
      const authResponse = await fetch(
        'https://edge.microsoft.com/translate/auth',
        authFetchOptions,
      );
      if (!authResponse.ok) throw new Error(`Bing Auth failed: ${authResponse.status}`);
      const token = await authResponse.text();

      const translateFetchOptions: any = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ Text: 'Hello, world!' }]),
      };
      if (engine.proxy) {
        translateFetchOptions.dispatcher = new ProxyAgent(engine.proxy);
      }

      const response = await fetch(
        'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans',
        translateFetchOptions,
      );

      if (!response.ok) throw new Error(`Bing Translate failed: ${response.status}`);
      const data = (await response.json()) as any;
      return res.json({ success: true, result: data[0].translations[0].text });
    } else if (engine.type === 'internal') {
      return res.json({ success: true, result: '[zh] Hello, world!' });
    } else {
      throw new Error(`Unsupported engine type: ${engine.type}`);
    }
  } catch (error: any) {
    res.status(500).json({ code: '500.TEST_FAILED', message: error.message });
  }
});

// --- API Key Management ---
router.get('/api-keys', adminOnly, async (_req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to fetch API keys' });
  }
});

router.post('/api-keys', adminOnly, async (req, res) => {
  try {
    const { name, expiresAt } = req.body;
    if (!name) {
      return res.status(400).json({ code: '400.BAD_REQUEST', message: 'Name is required' });
    }

    // Generate a random key: sk_ followed by 32 random chars
    const crypto = await import('node:crypto');
    const key = `sk_${crypto.randomBytes(24).toString('hex')}`;

    const newKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.json(newKey);
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to create API key' });
  }
});

router.delete('/api-keys/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) throw new Error('ID is required');
    await prisma.apiKey.delete({ where: { id: String(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to delete API key' });
  }
});

export default router;
