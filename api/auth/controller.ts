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

export const login = async (req: LoginRequest, res: Response) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ code: '401.UNAUTHORIZED', message: 'Invalid credentials' });
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
