import { describe, it, expect } from 'vitest';

const shouldSkipDbTests = Boolean(process.env.SKIP_DB_TESTS);

if (shouldSkipDbTests) {
  describe('API Endpoints (skipped)', () => {
    it('skips DB-backed tests when Prisma client engine is unavailable', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { default: app } = await import('../index.js');
  const request = (await import('supertest')).default;

  describe('API Endpoints', () => {
    it('GET /health should return ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('POST /api/skills/sync should reject unauthenticated', async () => {
      const res = await request(app).post('/api/skills/sync');
      expect(res.status).toBe(401);
    });
  });
}
