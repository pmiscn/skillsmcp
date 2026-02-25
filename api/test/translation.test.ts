import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../index.js';

describe('Translation System', () => {
  let skillId: string;
  let adminToken: string;

  beforeAll(async () => {
    // Setup test skill
    skillId = `test-skill-${uuidv4()}`;
    await prisma.skill.create({
      data: {
        id: skillId,
        name: 'Test Skill',
        description: 'A skill for testing translation',
        owner: 'test-owner',
        source: 'manual',
      },
    });

    const jwt = (await import('jsonwebtoken')).default;
    const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-key-change-this-in-production';
    adminToken = jwt.sign({ id: '1', username: 'admin', role: 'admin' }, JWT_SECRET);
  });

  afterAll(async () => {});

  it('should enqueue translation jobs via API', async () => {
    const skillIdEncoded = encodeURIComponent(skillId);
    const res = await request(app)
      .post(`/api/skills/${skillIdEncoded}/translate`)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        target_langs: ['zh'],
        modules: ['content'],
      });

    if (res.status !== 200) {
      console.log('Response:', res.text);
    }
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].payload_type).toBe('content');
  });

  it('should list translation jobs for a skill', async () => {
    console.log('Fetching jobs for skillId:', skillId);
    const skillIdEncoded = encodeURIComponent(skillId);
    const res = await request(app)
      .get(`/api/skills/${skillIdEncoded}/translation-jobs`)
      .set('Authorization', `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.log('Response:', res.text);
    }
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(res.body.jobs[0].skill_id).toBe(skillId);
  });
});
