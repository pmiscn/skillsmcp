import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from api directory to share database config
dotenv.config({ path: path.join(__dirname, '../../api/.env') });

const dbPath = path.resolve(__dirname, '../../api/prisma/dev.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}?connection_limit=1&busy_timeout=30000`,
    },
  },
  log: ['error', 'warn'],
});

// Enable WAL mode for SQLite
try {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');
  console.log('[MCP Database] SQLite WAL mode enabled.');
} catch (err) {
  console.error('[MCP Database] Failed to enable WAL mode:', err);
}

export default prisma;
