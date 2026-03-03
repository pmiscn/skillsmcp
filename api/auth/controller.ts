import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { JwtPayload, Tokens } from './types.js';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret';
const CAPTCHA_TTL_MS = Number(process.env.CAPTCHA_TTL_MS ?? '120000');
const CAPTCHA_LENGTH = Number(process.env.CAPTCHA_LENGTH ?? '5');

const CAPTCHA_MAP = new Map<string, { answer: string; expiresAt: number }>();

const captchaMessages = {
  en: {
    missingCaptcha: 'Captcha is required',
    invalidCaptcha: 'Invalid captcha',
  },
  zh: {
    missingCaptcha: '需要验证码',
    invalidCaptcha: '验证码错误',
  },
};

const authMessages = {
  en: {
    invalidCredentials: 'Invalid credentials',
    userDisabled: 'User disabled',
    authFailed: 'Authentication failed',
    missingFields: 'Username and password required',
    invalidFields: 'Invalid username or password',
    invalidUsername: 'Invalid username',
    weakPassword: 'Password must be at least 8 characters',
    userExists: 'Username already exists',
    registerFailed: 'Failed to register user',
    pendingApproval: 'Registration successful. Awaiting admin approval.',
  },
  zh: {
    invalidCredentials: '账号或密码错误',
    userDisabled: '用户已禁用',
    authFailed: '认证失败',
    missingFields: '需要用户名和密码',
    invalidFields: '用户名或密码无效',
    invalidUsername: '用户名无效',
    weakPassword: '密码至少 8 位',
    userExists: '用户名已存在',
    registerFailed: '注册失败',
    pendingApproval: '注册成功，请等待管理员审核。',
  },
};

const getLocale = (req: Request) => {
  const lang = req.headers['accept-language'];
  const raw = typeof lang === 'string' ? lang.toLowerCase() : '';
  if (raw.includes('zh')) return 'zh';
  return 'en';
};

const getAuthMessage = (req: Request, key: keyof typeof authMessages.en) => {
  const locale = getLocale(req);
  return authMessages[locale][key] ?? authMessages.en[key];
};

const getCaptchaMessage = (req: Request, key: keyof typeof captchaMessages.en) => {
  const locale = getLocale(req);
  return captchaMessages[locale][key] ?? captchaMessages.en[key];
};

const generateCaptchaAnswer = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

const generateCaptchaSvg = (answer: string) => {
  const padding = 12;
  const fontSize = 28;
  const width = Math.max(120, padding * 2 + answer.length * 18);
  const height = 48;
  const lines = Array.from({ length: 4 }).map(() => {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${Math.floor(
      Math.random() * 0xffffff,
    ).toString(16)}" stroke-width="1" />`;
  });

  const text = answer
    .split('')
    .map((char, index) => {
      const x = padding + index * 18 + Math.floor(Math.random() * 3);
      const y = 32 + Math.floor(Math.random() * 5);
      const rotate = (Math.random() * 10 - 5).toFixed(2);
      return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="monospace" fill="#1f2937" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f9fafb" />${lines.join('')}${text}</svg>`;
};

const storeCaptcha = (answer: string) => {
  const token = crypto.randomUUID();
  CAPTCHA_MAP.set(token, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return token;
};

const verifyCaptcha = (token: string, answer: string) => {
  const entry = CAPTCHA_MAP.get(token);
  if (!entry) return false;
  CAPTCHA_MAP.delete(token);
  if (Date.now() > entry.expiresAt) return false;
  return entry.answer.toUpperCase() === answer.toUpperCase();
};

interface LoginRequest extends Request {
  body: {
    username: string;
    password: string;
  };
}

const prismaAny = prisma as any;

export const login = async (req: LoginRequest, res: Response) => {
  const { username, password } = req.body;

  try {
    const user = await prismaAny.user.findUnique({ where: { username } });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res
        .status(401)
        .json({ code: '401.UNAUTHORIZED', message: getAuthMessage(req, 'invalidCredentials') });
    }
    if (!user.enabled) {
      return res
        .status(403)
        .json({ code: '403.USER_DISABLED', message: getAuthMessage(req, 'userDisabled') });
    }
    if ((user as any).status !== 'ACTIVE') {
      return res
        .status(403)
        .json({ code: '403.USER_DISABLED', message: getAuthMessage(req, 'userDisabled') });
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
    res.status(500).json({ error: getAuthMessage(req, 'authFailed') });
  }
};

export const register = async (req: Request, res: Response) => {
  const { username, password, captchaToken, captchaAnswer } = (req.body ?? {}) as Record<
    string,
    string
  >;

  if (!username || !password) {
    return res
      .status(400)
      .json({ code: '400.MISSING_FIELDS', message: getAuthMessage(req, 'missingFields') });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res
      .status(400)
      .json({ code: '400.INVALID_FIELDS', message: getAuthMessage(req, 'invalidFields') });
  }

  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return res
      .status(400)
      .json({ code: '400.INVALID_USERNAME', message: getAuthMessage(req, 'invalidUsername') });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ code: '400.WEAK_PASSWORD', message: getAuthMessage(req, 'weakPassword') });
  }

  if (!captchaToken || !captchaAnswer) {
    return res
      .status(400)
      .json({ code: '400.CAPTCHA_REQUIRED', message: getCaptchaMessage(req, 'missingCaptcha') });
  }

  if (!verifyCaptcha(String(captchaToken), String(captchaAnswer))) {
    return res
      .status(400)
      .json({ code: '400.CAPTCHA_INVALID', message: getCaptchaMessage(req, 'invalidCaptcha') });
  }

  try {
    const existing = await prismaAny.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
      return res
        .status(409)
        .json({ code: '409.USER_EXISTS', message: getAuthMessage(req, 'userExists') });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const user = await prismaAny.user.create({
      data: {
        username: normalizedUsername,
        password: hashed,
        role: 'user',
        enabled: true,
        status: 'PENDING',
      },
      select: {
        id: true,
        username: true,
        role: true,
        enabled: true,
        createdAt: true,
      },
    });

    res
      .status(201)
      .json({
        user: { ...user, status: 'PENDING' },
        message: getAuthMessage(req, 'pendingApproval'),
      });
  } catch (error) {
    res
      .status(500)
      .json({ code: '500.DATABASE_ERROR', message: getAuthMessage(req, 'registerFailed') });
  }
};

export const captcha = async (_req: Request, res: Response) => {
  const answer = generateCaptchaAnswer();
  const svg = generateCaptchaSvg(answer);
  const token = storeCaptcha(answer);

  res.json({ token, svg, expiresInMs: CAPTCHA_TTL_MS });
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
