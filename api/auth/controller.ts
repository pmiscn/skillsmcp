import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { JwtPayload, Tokens } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret';

interface LoginRequest extends Request {
  body: {
    username: string;
    password: string;
  };
}

interface RegisterRequest extends Request {
  body: {
    username: string;
    password: string;
  };
}

export const login = async (req: LoginRequest, res: Response) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ code: '401.UNAUTHORIZED', message: 'Invalid credentials' });
    }
    if (!user.enabled) {
      return res.status(403).json({ code: '403.USER_DISABLED', message: 'User disabled' });
    }

    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      search_engine: user.search_engine ?? 'auto',
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    const tokens: Tokens = { accessToken, refreshToken };
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const register = async (req: RegisterRequest, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ code: '400.MISSING_FIELDS', message: 'Username and password required' });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res
      .status(400)
      .json({ code: '400.INVALID_FIELDS', message: 'Invalid username or password' });
  }

  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return res.status(400).json({ code: '400.INVALID_USERNAME', message: 'Invalid username' });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ code: '400.WEAK_PASSWORD', message: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
      return res.status(409).json({ code: '409.USER_EXISTS', message: 'Username already exists' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        password: hashed,
        role: 'user',
        enabled: true,
      },
      select: { id: true, username: true, role: true, enabled: true, createdAt: true },
    });

    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR', message: 'Failed to register user' });
  }
};

interface RefreshRequest extends Request {
  body: {
    refreshToken?: string;
  };
}

export const refresh = async (req: RefreshRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ code: '401.MISSING_TOKEN' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as jwt.JwtPayload & { id: string };
    if (!decoded || !decoded.id) return res.status(403).json({ code: '403.INVALID_TOKEN' });

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(403).json({ code: '403.USER_NOT_FOUND' });

    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      search_engine: user.search_engine ?? 'auto',
    };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ code: '403.INVALID_TOKEN' });
  }
};

interface MeRequest extends Request {
  user?: JwtPayload;
}

export const me = async (req: MeRequest, res: Response) => {
  // Return the user payload attached by auth middleware
  if (!req.user) return res.status(401).json({ code: '401.UNAUTHENTICATED' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, role: true, search_engine: true },
    });
    if (!user) return res.status(404).json({ code: '404.USER_NOT_FOUND' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

const getBool = (value: unknown): boolean => value === true;

const extractProvider = (value: unknown) => {
  const record = toRecord(value);
  return {
    enabled: getBool(record?.enabled),
    clientId: getString(record?.clientId),
  };
};

export const oauthProviders = async (_req: Request, res: Response) => {
  try {
    const row = await (prisma as any).systemConfig.findUnique({
      where: { key: 'oauth_config' },
    });

    const raw = row?.value ? JSON.parse(row.value) : {};
    const rawRecord = toRecord(raw) || {};
    const rawProviders = toRecord(rawRecord.providers) || {};
    const rawLdap = toRecord(rawRecord.ldap) || {};

    const response = {
      ldap: {
        enabled: getBool(rawLdap.enabled),
      },
      providers: {
        google: extractProvider(rawProviders.google),
        microsoft: extractProvider(rawProviders.microsoft),
        github: extractProvider(rawProviders.github),
        wechat: extractProvider(rawProviders.wechat),
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ code: '500.DB_ERROR', message: 'Failed to fetch OAuth providers' });
  }
};
