import { Router } from 'express';
import prisma from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

router.use(authenticateToken);

const adminOnly = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: '403.ADMIN_REQUIRED', message: 'Admin access required' });
  }
  next();
};

router.get('/preferences', async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.status(401).json({ code: '401.UNAUTHENTICATED' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, search_engine: true },
    });
    if (!user) return res.status(404).json({ code: '404.USER_NOT_FOUND' });
    res.json({ search_engine: user.search_engine ?? 'auto' });
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.put('/preferences', async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.status(401).json({ code: '401.UNAUTHENTICATED' });
  const { search_engine } = req.body ?? {};
  const allowed = ['auto', 'tfidf', 'sbert', 'hybrid'];
  if (!allowed.includes(search_engine)) {
    return res.status(400).json({ code: '400.INVALID_ENGINE' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { search_engine },
      select: { id: true, search_engine: true },
    });
    res.json({ search_engine: user.search_engine ?? 'auto' });
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR' });
  }
});

router.get('/', adminOnly, async (_req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        enabled: true,
        provider: true,
        providerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR', message: 'Failed to fetch users' });
  }
});

router.post('/', adminOnly, async (req: AuthRequest, res) => {
  const { username, password, role, enabled } = req.body ?? {};
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

  const normalizedRole = typeof role === 'string' && role.trim() ? role.trim() : 'user';

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
        role: normalizedRole,
        enabled: enabled === undefined ? true : Boolean(enabled),
      },
      select: {
        id: true,
        username: true,
        role: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR', message: 'Failed to create user' });
  }
});

router.put('/:id', adminOnly, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { password, role, enabled, username } = req.body ?? {};

  if (!id) return res.status(400).json({ code: '400.MISSING_ID', message: 'User ID required' });

  const data: any = {};

  if (typeof username === 'string') {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return res.status(400).json({ code: '400.INVALID_USERNAME', message: 'Invalid username' });
    }
    data.username = normalizedUsername;
  }

  if (typeof role === 'string' && role.trim()) {
    data.role = role.trim();
  }

  if (enabled !== undefined) {
    data.enabled = Boolean(enabled);
  }

  if (typeof password === 'string') {
    if (password.length < 8) {
      return res
        .status(400)
        .json({ code: '400.WEAK_PASSWORD', message: 'Password must be at least 8 characters' });
    }
    data.password = bcrypt.hashSync(password, 10);
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ code: '400.NO_UPDATES', message: 'No valid fields to update' });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: String(id) },
      data,
      select: {
        id: true,
        username: true,
        role: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ code: '409.USER_EXISTS', message: 'Username already exists' });
    }
    res.status(500).json({ code: '500.DATABASE_ERROR', message: 'Failed to update user' });
  }
});

router.delete('/:id', adminOnly, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ code: '400.MISSING_ID', message: 'User ID required' });

  try {
    await prisma.user.delete({ where: { id: String(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ code: '500.DATABASE_ERROR', message: 'Failed to delete user' });
  }
});

export default router;
