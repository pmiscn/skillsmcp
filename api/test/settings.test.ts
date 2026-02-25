import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';

vi.mock('undici', () => ({
  ProxyAgent: vi.fn().mockImplementation(function (url: string) {
    return { url };
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Settings API - Security & Translation', () => {
  let adminToken: string;

  beforeEach(async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-key-change-this-in-production';
    adminToken = jwt.sign({ id: '1', username: 'admin', role: 'admin' }, JWT_SECRET);

    vi.stubEnv('OPENAI_API_KEY', 'env-key-123');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    });
  });

  describe('API Key Resolution', () => {
    it('should resolve environment variables', async () => {
      const res = await request(app)
        .post('/api/settings/security/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            provider: 'openai',
            model: 'gpt-4',
            api_key: 'OPENAI_API_KEY',
          },
        });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[0]!;
      const headers = lastCall[1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-key-123');
    });

    it('should use plain text keys if no env var exists', async () => {
      const res = await request(app)
        .post('/api/settings/security/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            provider: 'openai',
            model: 'gpt-4',
            api_key: 'sk-direct-key',
          },
        });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[0]!;
      const headers = lastCall[1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-direct-key');
    });
  });

  describe('Proxy Configuration', () => {
    it('should include dispatcher when proxy is configured', async () => {
      const res = await request(app)
        .post('/api/settings/security/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            provider: 'openai',
            proxy: 'http://localhost:8080',
          },
        });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[0]!;
      const options = lastCall[1]!;
      expect(options.dispatcher).toBeDefined();
    });

    it('should omit dispatcher when proxy is missing', async () => {
      const res = await request(app)
        .post('/api/settings/security/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config: {
            provider: 'openai',
            proxy: '',
          },
        });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[0]!;
      const options = lastCall[1]!;
      expect(options.dispatcher).toBeUndefined();
    });
  });
});
