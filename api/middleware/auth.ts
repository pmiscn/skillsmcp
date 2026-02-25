import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../auth/types.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;

  if (!token) return res.status(401).json({ code: '401.MISSING_TOKEN' });

  try {
    console.log('DEBUG: Middleware JWT_SECRET:', JWT_SECRET);
    console.log('DEBUG: Incoming token:', token);
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & JwtPayload;
    console.log('DEBUG: Decoded token:', decoded);
    if (!decoded || !decoded.id) {
      console.log('DEBUG: Invalid decoded payload:', decoded);
      return res.status(403).json({ code: '403.INVALID_TOKEN' });
    }

    // Attach cleaned payload
    req.user = {
      id: String(decoded.id),
      username: decoded.username ?? null,
      role: decoded.role ?? null,
      search_engine: decoded.search_engine ?? null,
      iat: typeof decoded.iat === 'number' ? decoded.iat : undefined,
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
    };

    next();
  } catch (err) {
    return res.status(403).json({ code: '403.INVALID_TOKEN' });
  }
};
