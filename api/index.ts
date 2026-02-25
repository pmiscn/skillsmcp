import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'node:util';
import express from 'express';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
process.on('uncaughtException', (err) => {
  console.error('--- UNCAUGHT EXCEPTION ---');
  try {
    const { normalizeError, inspectObject } = require('./utils/errors');
    const e = normalizeError(err);
    console.error('Normalized:', inspectObject(e, null));
    if (e.stack) console.error(e.stack);
  } catch (logErr) {
    console.error('Failed to log uncaught exception details:', logErr);
    console.error(
      'FALLBACK Inspect:',
      util.inspect(err, { showHidden: true, depth: null, colors: true }),
    );
    if (err instanceof Error) console.error(err.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- UNHANDLED REJECTION ---');
  try {
    const { normalizeError, inspectObject } = require('./utils/errors');
    const e = normalizeError(reason);
    console.error('Normalized reason:', inspectObject(e, null));
    if ((e as any).stack) console.error((e as any).stack);
  } catch (logErr) {
    console.error('Failed to log unhandled rejection details:', logErr);
    console.error(
      'FALLBACK Reason:',
      util.inspect(reason, { showHidden: true, depth: null, colors: true }),
    );
  }
  // Do not exit automatically here; allow graceful shutdown if desired.
});

dotenv.config({ path: path.join(__dirname, '.env') });

const shouldSkipPrisma =
  process.env.PRISMA_CLIENT_ENGINE_TYPE === 'client' && !process.env.PRISMA_ACCELERATE_URL;
// Always false for local dev/test unless explicitly wanted
const actualShouldSkipPrisma = false;
let authRoutes, skillsRoutes, usersRoutes, settingsRoutes;
try {
  authRoutes = actualShouldSkipPrisma ? undefined : await import('./auth/routes.js');
  skillsRoutes = await import('./skills/routes.js');
  usersRoutes = actualShouldSkipPrisma ? undefined : await import('./users/routes.js');
  settingsRoutes = await import('./settings/routes.js');
} catch (err) {
  console.error('--- IMPORT ERROR ---');
  console.error('Type:', typeof err);
  console.error('Prototype:', Object.getPrototypeOf(err));
  console.error('Inspect:', util.inspect(err, { showHidden: true, depth: null, colors: true }));
  if (err instanceof Error) {
    console.error('Stack:', err.stack);
  }
  process.exit(1);
}

console.log('DEBUG: JWT_SECRET from process.env:', process.env.JWT_SECRET);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 8002;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

if (!actualShouldSkipPrisma && authRoutes) {
  app.use('/api/auth', authRoutes.default);
  app.use('/api/skills', skillsRoutes.default);
  console.log('[App] Mounted /api/skills routes');
  if (usersRoutes) {
    app.use('/api/users', usersRoutes.default);
  }
  app.use('/api/settings', settingsRoutes.default);
} else {
  app.use('/api/skills', skillsRoutes.default);
  console.log('[App] Mounted /api/skills routes (no auth)');
  app.use('/api/settings', settingsRoutes.default);
}

app.get('/health', (req, res) => {
  void req.headers;
  res.json({ status: 'ok' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});

export default app;

// Centralized top-level handlers to improve diagnostics for non-Error throws

process.on('uncaughtException', (err) => {
  try {
    console.error('[App] uncaughtException typeof:', typeof err);
    console.error('[App] uncaughtException prototype:', Object.getPrototypeOf(err));
    console.error('[App] uncaughtException inspect:', util.inspect(err, { depth: null }));
    if (err && err.stack) console.error(err.stack);
  } catch (e) {
    console.error('[App] Failed to log uncaughtException', e);
  }
  // Don't exit here — let the process manager decide. If desired, call process.exit(1).
});

process.on('unhandledRejection', (reason) => {
  try {
    console.error('[App] unhandledRejection typeof:', typeof reason);
    console.error('[App] unhandledRejection prototype:', Object.getPrototypeOf(reason));
    console.error('[App] unhandledRejection inspect:', util.inspect(reason, { depth: null }));
    if (reason && (reason as any).stack) console.error((reason as any).stack);
  } catch (e) {
    console.error('[App] Failed to log unhandledRejection', e);
  }
});
