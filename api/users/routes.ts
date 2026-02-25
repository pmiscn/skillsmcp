import { Router } from 'express';
import prisma from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

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

export default router;
