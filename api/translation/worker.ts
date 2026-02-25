import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import { ProxyAgent } from 'undici';
import prisma from '../db.js';
import util from 'node:util';
import { normalizeError } from '../utils/errors.js';

type TranslationEngine = {
  type: string;
  provider?: string;
  model?: string;
  url?: string;
  apiKeyHeader?: string;
  apiKeyEnv?: string;
  proxy?: string;
};

type TranslationConfig = {
  engines: TranslationEngine[];
};

type TranslationPayload = {
  type: string;
  sourceLang?: string;
  targetLang: string;
  text?: string;
  data?: Record<string, any>;
};

const WORKER_ID = process.env.TRANSLATION_WORKER_ID || `worker-${os.hostname()}`;
const CONCURRENCY = Number(process.env.TRANSLATION_CONCURRENCY || 10);
const LOCK_TIMEOUT_MINUTES = Number(process.env.TRANSLATION_LOCK_TIMEOUT_MINUTES || 15);
const MAX_ATTEMPTS = Number(process.env.TRANSLATION_MAX_ATTEMPTS || 3);
const SKILLSHUB_BASE_URL = process.env.SKILLSHUB_BASE_URL || 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(process.cwd());
const ROOT_DIR = path.resolve(PROJECT_ROOT, '..');
const TRANSLATION_CONFIG_PATH =
  process.env.TRANSLATION_CONFIG_PATH || path.resolve(PROJECT_ROOT, 'translation', 'config.json');

let cachedConfig: TranslationConfig | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJson = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeLang = (lang?: string | null) => (lang ? String(lang).toLowerCase() : 'en');

const isLockedExpired = (lockedAt?: Date | null) => {
  if (!lockedAt) return true;
  const age = Date.now() - lockedAt.getTime();
  return age > LOCK_TIMEOUT_MINUTES * 60 * 1000;
};

const claimJobs = async (limit: number) => {
  const now = new Date();
  const lockExpirationDate = new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60 * 1000);
  const claimed: any[] = [];

  // Find candidates: queued, retry, or expired processing jobs
  const jobs = await prisma.translationJob.findMany({
    where: {
      OR: [
        { status: { in: ['queued', 'retry'] } },
        {
          status: 'processing',
          locked_at: { lt: lockExpirationDate },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit * 2,
  });

  for (const job of jobs) {
    if (claimed.length >= limit) break;

    // Use updateMany for atomic check-and-set
    const updated = await prisma.translationJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: { in: ['queued', 'retry'] } },
          {
            status: 'processing',
            locked_at: { lt: lockExpirationDate },
          },
        ],
      },
      data: {
        locked_at: now,
        locked_by: WORKER_ID,
        status: 'processing',
        // If it was already processing, increment attempts as it likely failed/timed out
        attempts: job.status === 'processing' ? job.attempts + 1 : job.attempts,
      },
    });

    if (updated.count > 0) {
      // Re-fetch the job to get the payload and other fields
      const fullJob = await prisma.translationJob.findUnique({ where: { id: job.id } });
      if (fullJob) {
        if (job.status === 'processing') {
          console.log(
            `[TranslationWorker] Rescuing stuck job ${job.id} (last locked at ${job.locked_at})...`,
          );
        }
        claimed.push(fullJob);
      }
    }
  }
  return claimed;
};

const writeArtifact = async (
  skillPath: string | null | undefined,
  lang: string,
  content: string,
) => {
  if (!skillPath) return;
  const absolutePath = path.isAbsolute(skillPath)
    ? skillPath
    : path.resolve(ROOT_DIR, skillPath.replace(/^projects\/skillsmcp\//, ''));
  const dir = path.dirname(absolutePath);
  const baseName = path.basename(absolutePath, path.extname(absolutePath));
  const ext = path.extname(absolutePath) || '.md';
  const outName = `${baseName}_${lang}${ext}`;
  const outPath = path.join(dir, outName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(outPath, content, 'utf-8');
};

const loadConfig = async (): Promise<TranslationConfig> => {
  if (cachedConfig) return cachedConfig;
  try {
    const content = await fs.readFile(TRANSLATION_CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(content) as TranslationConfig;
    return cachedConfig;
  } catch (err) {
    console.warn(`[TranslationWorker] Failed to load config from ${TRANSLATION_CONFIG_PATH}:`, err);
    return { engines: [{ type: 'internal' }] };
  }
};

const watchConfig = () => {
  try {
    const watcher = watch(path.dirname(TRANSLATION_CONFIG_PATH), (eventType, filename) => {
      if (filename === path.basename(TRANSLATION_CONFIG_PATH)) {
        console.log(`[TranslationWorker] Config file ${eventType}, clearing cache...`);
        cachedConfig = null;
      }
    });
    watcher.on('error', (err) => {
      console.error('[TranslationWorker] Config watcher error:', err);
    });
  } catch (err) {
    console.error('[TranslationWorker] Could not start config watcher:', err);
  }
};

const getEngineOrder = async () => {
  const envOrder = process.env.TRANSLATION_ENGINE_ORDER;
  if (envOrder) {
    return envOrder
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const config = await loadConfig();
  return config.engines.map((e) => e.type);
};

const callHttpEngine = async (
  url: string,
  apiKeyHeader: string | undefined,
  apiKey: string | undefined,
  payload: Record<string, any>,
  proxy?: string,
) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKeyHeader && apiKey) headers[apiKeyHeader] = apiKey;

  const fetchOptions: any = {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  };
  if (proxy && typeof proxy === 'string' && proxy.trim()) {
    fetchOptions.dispatcher = new ProxyAgent(proxy.trim());
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) throw new Error(`Translation engine error: ${response.status}`);
  const data = await response.json();
  if (!data?.text) throw new Error('Translation engine missing text');
  return String(data.text);
};

const callGoogleFreeEngine = async (
  input: string,
  sourceLang: string,
  targetLang: string,
  proxy?: string,
) => {
  if (!input) return '';
  const params = new URLSearchParams({
    client: 'gtx',
    dt: 't',
    sl: sourceLang,
    tl: targetLang,
    q: input,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

  const fetchOptions: any = { method: 'GET' };
  if (proxy && typeof proxy === 'string' && proxy.trim()) {
    fetchOptions.dispatcher = new ProxyAgent(proxy.trim());
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    throw new Error(`Google Free error: ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Google Free error: invalid response format');
  }
  const segments = data[0];
  if (!Array.isArray(segments)) {
    throw new Error('Google Free error: missing translation segments');
  }
  const translated = segments
    .map((segment) => (Array.isArray(segment) ? segment[0] : ''))
    .filter((value) => typeof value === 'string')
    .join('')
    .trim();
  if (!translated && input.trim()) {
    throw new Error('Google Free error: empty translation');
  }
  return translated;
};

const callBingFreeEngine = async (
  input: string,
  sourceLang: string,
  targetLang: string,
  proxy?: string,
) => {
  if (!input) return '';

  const mapLang = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === 'zh') return 'zh-Hans';
    return l;
  };

  try {
    const authFetchOptions: any = { method: 'GET' };
    if (proxy) {
      authFetchOptions.dispatcher = new ProxyAgent(proxy);
    }
    const authResponse = await fetch('https://edge.microsoft.com/translate/auth', authFetchOptions);
    if (!authResponse.ok) throw new Error(`Bing Auth failed: ${authResponse.status}`);
    const token = await authResponse.text();

    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${mapLang(
      sourceLang,
    )}&to=${mapLang(targetLang)}`;

    const fetchOptions: any = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ Text: input }]),
    };
    if (proxy) {
      fetchOptions.dispatcher = new ProxyAgent(proxy);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) throw new Error(`Bing Translate failed: ${response.status}`);
    const data = (await response.json()) as any;
    return String(data[0].translations[0].text);
  } catch (err) {
    const e = normalizeError(err);
    console.error('[TranslationWorker] Bing Free failed:', util.inspect(err, { depth: 2 }));
    throw e;
  }
};

const translateTextInternal = async (input: string, _sourceLang: string, targetLang: string) => {
  return `[${targetLang}] ${input}`;
};

const resolveApiKey = (value?: string) => {
  if (!value) return undefined;
  if (process.env[value]) return process.env[value];
  return value;
};

const callLlmProvider = async (
  engine: TranslationEngine,
  input: string,
  sourceLang: string,
  targetLang: string,
) => {
  const provider = engine.provider || 'openai';
  const model = engine.model || 'gpt-4o';
  const apiKey = resolveApiKey(engine.apiKeyEnv);
  const baseUrl = engine.url;

  const prompt = `You are a senior technical localizer specializing in AI Skills and MCP (Model Context Protocol). 
Translate the following content from ${sourceLang} to ${targetLang}.

RULES:
1. IDENTIFIERS: NEVER translate identifiers, function names, variable names, or technical constants.
2. JSON/YAML/PLISTS: If the input is a structured format, translate only the descriptive values, NEVER translate the keys or structural elements.
3. COMMENTS: Translate code comments (//, #, /* */) while preserving the symbols and indentation.
4. CLI/SCRIPTS: NEVER translate command-line commands, flags (e.g., --verbose), shell environment variable names, or script-internal logic.
5. FORMAT: Preserve all Markdown syntax, code blocks, and placeholders.
6. TECHNICAL TERMS: Use professional technical terminology appropriate for ${targetLang}. For example, translate "deployment" as "部署" in Chinese.
7. OUTPUT: Return ONLY the translated text without any preamble or explanations.

TEXT TO TRANSLATE:
${input}`;

  try {
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

    if (openaiCompatible.includes(provider) || provider === 'azure') {
      let url = baseUrl && provider !== 'azure' ? `${baseUrl}/chat/completions` : baseUrl;
      if (!url && provider === 'openai') url = 'https://api.openai.com/v1/chat/completions';
      if (!url) throw new Error(`Missing URL for provider ${provider}`);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (provider === 'azure') {
        if (apiKey) headers['api-key'] = apiKey;
      } else {
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const fetchOptions: any = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      };
      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      // Add detailed request logging
      const maskedHeaders = { ...headers };
      if (maskedHeaders['Authorization']) {
        const auth = maskedHeaders['Authorization'];
        maskedHeaders['Authorization'] =
          auth.length > 20
            ? `${auth.substring(0, 15)}...${auth.substring(auth.length - 5)}`
            : 'Bearer **********';
      }
      if (maskedHeaders['api-key']) {
        const key = maskedHeaders['api-key'];
        maskedHeaders['api-key'] =
          key.length > 10
            ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
            : '**********';
      }

      console.log(`[TranslationWorker] [LLM Request] Provider: ${provider}, Model: ${model}`);
      console.log(`[TranslationWorker] [LLM Request] URL: ${url}`);
      console.log(`[TranslationWorker] [LLM Request] Headers: ${JSON.stringify(maskedHeaders)}`);
      const truncatedPrompt = prompt.length > 500 ? prompt.substring(0, 500) + '...' : prompt;
      console.log(
        `[TranslationWorker] [LLM Request] Payload (truncated): ${JSON.stringify({ model, messages: [{ role: 'user', content: truncatedPrompt }], temperature: 0.3 })}`,
      );

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No body');
        console.error(`[TranslationWorker] [LLM Response Error] Status: ${response.status}`);
        console.error(`[TranslationWorker] [LLM Response Error] Body: ${errorBody}`);
        throw new Error(`LLM Error: ${response.status}`);
      }
      const data = (await response.json()) as any;
      console.log(
        `[TranslationWorker] [LLM Response Success] ${provider} returned ${data?.choices?.[0]?.message?.content?.length || 0} chars`,
      );
      return String(data.choices[0].message.content).trim();
    }

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const fetchOptions: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      };
      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      console.log(`[TranslationWorker] [LLM Request] Provider: ${provider}, Model: ${model}`);
      console.log(`[TranslationWorker] [LLM Request] URL: ${url.split('?')[0]}?key=**********`);
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No body');
        console.error(`[TranslationWorker] [LLM Response Error] Status: ${response.status}`);
        console.error(`[TranslationWorker] [LLM Response Error] Body: ${errorBody}`);
        throw new Error(`Gemini Error: ${response.status}`);
      }
      const data = (await response.json()) as any;
      console.log(
        `[TranslationWorker] [LLM Response Success] ${provider} returned ${data?.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0} chars`,
      );
      return String(data.candidates[0].content.parts[0].text).trim();
    }

    if (provider === 'anthropic') {
      const url = baseUrl || 'https://api.anthropic.com/v1/messages';
      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      };
      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      const maskedHeaders = { ...fetchOptions.headers };
      if (maskedHeaders['x-api-key']) {
        const key = maskedHeaders['x-api-key'];
        maskedHeaders['x-api-key'] =
          key.length > 10
            ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
            : '**********';
      }

      console.log(`[TranslationWorker] [LLM Request] Provider: ${provider}, Model: ${model}`);
      console.log(`[TranslationWorker] [LLM Request] URL: ${url}`);
      console.log(`[TranslationWorker] [LLM Request] Headers: ${JSON.stringify(maskedHeaders)}`);
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No body');
        console.error(`[TranslationWorker] [LLM Response Error] Status: ${response.status}`);
        console.error(`[TranslationWorker] [LLM Response Error] Body: ${errorBody}`);
        throw new Error(`Anthropic Error: ${response.status}`);
      }
      const data = (await response.json()) as any;
      console.log(
        `[TranslationWorker] [LLM Response Success] ${provider} returned ${data?.content?.[0]?.text?.length || 0} chars`,
      );
      return String(data.content[0].text).trim();
    }

    if (provider === 'ollama') {
      const url = baseUrl ? `${baseUrl}/api/generate` : 'http://localhost:11434/api/generate';
      const fetchOptions: any = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      };
      if (engine.proxy && typeof engine.proxy === 'string' && engine.proxy.trim()) {
        fetchOptions.dispatcher = new ProxyAgent(engine.proxy.trim());
      }

      console.log(`[TranslationWorker] [LLM Request] Provider: ${provider}, Model: ${model}`);
      console.log(`[TranslationWorker] [LLM Request] URL: ${url}`);
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No body');
        console.error(`[TranslationWorker] [LLM Response Error] Status: ${response.status}`);
        console.error(`[TranslationWorker] [LLM Response Error] Body: ${errorBody}`);
        throw new Error(`Ollama Error: ${response.status}`);
      }
      const data = (await response.json()) as any;
      console.log(
        `[TranslationWorker] [LLM Response Success] ${provider} returned ${data?.response?.length || 0} chars`,
      );
      return String(data.response).trim();
    }
  } catch (err) {
    const e = normalizeError(err);
    console.error(
      `[TranslationWorker] LLM provider ${provider} failed:`,
      util.inspect(err, { depth: 2 }),
    );
    throw e;
  }
  throw new Error(`Unsupported provider: ${provider}`);
};

const translateText = async (input: string, sourceLang: string, targetLang: string) => {
  const config = await loadConfig();
  const order = await getEngineOrder();
  for (const engineType of order) {
    const engine = config.engines.find((e) => e.type === engineType);
    if (!engine) continue;
    try {
      if (engineType === 'http' && engine.url) {
        const apiKey = resolveApiKey(engine.apiKeyEnv);
        return await callHttpEngine(
          engine.url,
          engine.apiKeyHeader,
          apiKey,
          {
            text: input,
            source_lang: sourceLang,
            target_lang: targetLang,
          },
          engine.proxy,
        );
      }
      if (engineType === 'llm') {
        return await callLlmProvider(engine, input, sourceLang, targetLang);
      }
      if (engineType === 'google-free') {
        return await callGoogleFreeEngine(input, sourceLang, targetLang, engine.proxy);
      }
      if (engineType === 'bing-free') {
        return await callBingFreeEngine(input, sourceLang, targetLang, engine.proxy);
      }
      if (engineType === 'internal') {
        return await translateTextInternal(input, sourceLang, targetLang);
      }
    } catch (err) {
      console.warn(`[TranslationWorker] Engine ${engineType} failed:`, err);
    }
  }
  return await translateTextInternal(input, sourceLang, targetLang);
};

const translateData = async (data: Record<string, any>, sourceLang: string, targetLang: string) => {
  const translated: Record<string, any> = Array.isArray(data) ? [] : {};
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string') {
        translated.push(await translateText(item, sourceLang, targetLang));
      } else if (item && typeof item === 'object') {
        translated.push(await translateData(item, sourceLang, targetLang));
      } else {
        translated.push(item);
      }
    }
    return translated;
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      translated[key] = await translateText(value, sourceLang, targetLang);
    } else if (value && typeof value === 'object') {
      translated[key] = await translateData(value as Record<string, any>, sourceLang, targetLang);
    } else {
      translated[key] = value;
    }
  }
  return translated;
};

const updateSkillField = async (skillId: string, field: string, lang: string, value: any) => {
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return;
  const current = parseJson((skill as any)[field]) || {};
  current[lang] = value;
  await prisma.skill.update({
    where: { id: skillId },
    data: { [field]: JSON.stringify(current) } as any,
  });
};

const handleJob = async (job: any) => {
  const payload = parseJson(job.payload) as TranslationPayload | null;
  const targetLang = normalizeLang(job.target_lang);
  const sourceLang = normalizeLang(job.source_lang || payload?.sourceLang);
  if (!payload) throw new Error('Missing payload');

  if (payload.type === 'content') {
    const text = payload.text || '';
    const translated = await translateText(text, sourceLang, targetLang);
    await updateSkillField(job.skill_id, 'content_i18n', targetLang, translated);
    const skill = await prisma.skill.findUnique({ where: { id: job.skill_id } });
    await writeArtifact(skill?.skill_path, targetLang, translated);
  } else if (payload.type === 'name' || payload.type === 'description') {
    const text = payload.text || '';
    const translated = await translateText(text, sourceLang, targetLang);
    const fieldName = `${payload.type}_${targetLang}`;
    await prisma.skill.update({
      where: { id: job.skill_id },
      data: { [fieldName]: translated },
    });
  } else {
    const data = payload.data || {};
    const translated = await translateData(data, sourceLang, targetLang);
    await updateSkillField(job.skill_id, payload.type, targetLang, translated);
  }

  await prisma.translationJob.update({
    where: { id: job.id },
    data: { status: 'completed', locked_at: null, locked_by: null },
  });
};

let rebuildPending = false;
let lastRebuildTime = 0;
const REBUILD_DEBOUNCE_MS = 30000;

const triggerIndexRebuild = async () => {
  if (rebuildPending) return;

  const now = Date.now();
  const timeSinceLast = now - lastRebuildTime;

  if (timeSinceLast < REBUILD_DEBOUNCE_MS) {
    rebuildPending = true;
    setTimeout(async () => {
      rebuildPending = false;
      performRebuild();
    }, REBUILD_DEBOUNCE_MS - timeSinceLast);
    return;
  }

  performRebuild();
};

const performRebuild = async () => {
  const apiKey = process.env.SKILLSHUB_API_KEY;
  if (!apiKey) return;
  lastRebuildTime = Date.now();
  try {
    console.log('[TranslationWorker] Triggering index rebuild...');
    const response = await fetch(`${SKILLSHUB_BASE_URL}/index/rebuild`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey },
    });
    if (!response.ok) {
      console.warn(`[TranslationWorker] Index rebuild returned ${response.status}`);
    }
  } catch (err) {
    console.warn('[TranslationWorker] Index rebuild failed', err);
  }
};

const isSkillTranslationComplete = async (skillId: string) => {
  const pending = await prisma.translationJob.count({
    where: {
      skill_id: skillId,
      status: { in: ['queued', 'retry', 'processing'] },
    },
  });
  return pending === 0;
};

const run = async () => {
  const intervalMs = Number(process.env.TRANSLATION_POLL_INTERVAL_MS || 5000);
  watchConfig();
  console.log(
    `[TranslationWorker] Started. ID: ${WORKER_ID}, Concurrency: ${CONCURRENCY}, Polling interval: ${intervalMs}ms`,
  );

  let activeJobs = 0;

  while (true) {
    if (activeJobs >= CONCURRENCY) {
      await sleep(100);
      continue;
    }

    const limit = CONCURRENCY - activeJobs;
    const jobs = await claimJobs(limit);

    if (jobs.length === 0) {
      if (activeJobs === 0) {
        await sleep(intervalMs);
      } else {
        await sleep(500);
      }
      continue;
    }

    for (const job of jobs) {
      activeJobs++;
      console.log(`[TranslationWorker] Processing job ${job.id} for skill ${job.skill_id}...`);
      handleJob(job)
        .then(async () => {
          console.log(`[TranslationWorker] Completed job ${job.id}.`);
          if (await isSkillTranslationComplete(job.skill_id)) {
            console.log(
              `[TranslationWorker] All jobs for skill ${job.skill_id} complete. Triggering index rebuild...`,
            );
            await triggerIndexRebuild();
          }
        })
        .catch(async (error: any) => {
          // Normalize and log full inspect of error to avoid null-prototype output
          const { normalizeError, inspectObject } = await import('../utils/errors.js');
          const e = normalizeError(error);
          console.error(
            `[TranslationWorker] Error processing job ${job.id} (Attempt ${job.attempts + 1}):`,
            inspectObject(error, 2),
          );
          await prisma.translationJob.update({
            where: { id: job.id },
            data: {
              status: 'retry',
              attempts: job.attempts + 1,
              last_error: e.message || 'Translation failed',
              locked_at: null,
              locked_by: null,
            },
          });
        })
        .finally(() => {
          activeJobs--;
        });
    }
  }
};

run().catch((err) => {
  try {
    const e = normalizeError(err);
    console.error('[TranslationWorker] Fatal error');
    console.error('[TranslationWorker] typeof:', typeof err);
    console.error('[TranslationWorker] prototype:', Object.getPrototypeOf(err));
    console.error('[TranslationWorker] inspect:', util.inspect(err, { depth: null }));
    if (e.stack) console.error(e.stack);
  } catch (logErr) {
    console.error('[TranslationWorker] Failed to log fatal error details', logErr);
  }
  process.exit(1);
});
