import { Router } from 'express';
import { login, refresh, me } from './controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authenticateToken, me);

export default router;
