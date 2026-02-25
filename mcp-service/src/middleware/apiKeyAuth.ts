import { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';

export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    role: string;
  };
}

export const authenticateApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  let key: string | undefined;

  if (typeof apiKeyHeader === 'string') {
    key = apiKeyHeader;
  } else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer sk_')) {
    key = authHeader.split(' ')[1];
  }

  if (!key) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Missing API Key' },
      id: (req.body as any)?.id || null,
    });
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { key },
    });

    if (!apiKey) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid API Key' },
        id: (req.body as any)?.id || null,
      });
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'API Key expired' },
        id: (req.body as any)?.id || null,
      });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsed: new Date() },
    });

    req.apiKey = {
      id: apiKey.id,
      name: apiKey.name,
      role: apiKey.role,
    };

    next();
  } catch (err) {
    console.error('[MCP Auth] Error validating API Key:', err);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: (req.body as any)?.id || null,
    });
  }
};
