import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-key-change-this-in-production';

describe('SSE Authentication', () => {
  it('GET /api/skills/sync/stream/:id should return 401 without token', async () => {
    const res = await request(app).get('/api/skills/sync/stream/fake-id');
    expect(res.status).toBe(401);
  });

  it('GET /api/skills/sync/stream/:id should return 403 with invalid token', async () => {
    const res = await request(app).get('/api/skills/sync/stream/fake-id?token=invalid');
    expect(res.status).toBe(403);
  });

  it('GET /api/skills/sync/stream/:id should return 404 for valid token but non-existent job', async () => {
    const token = jwt.sign({ id: '1', username: 'admin', role: 'admin' }, JWT_SECRET);
    const res = await request(app).get(`/api/skills/sync/stream/non-existent?token=${token}`);
    expect(res.status).toBe(404);
  });
});
