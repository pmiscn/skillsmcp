import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Enable WAL mode for SQLite to improve performance and concurrency
try {
  // Use $queryRawUnsafe because PRAGMA journal_mode returns a result, which $executeRawUnsafe doesn't like in some Prisma versions for SQLite
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');
  console.log('[Database] SQLite WAL mode and synchronous=NORMAL enabled.');
} catch (err) {
  console.error('[Database] Failed to enable WAL mode:', err);
}

export default prisma;
