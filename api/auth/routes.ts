import { Router } from 'express';
import { login, refresh, me, register, oauthProviders } from './controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/refresh', refresh);
router.get('/me', authenticateToken, me);
router.get('/oauth/providers', oauthProviders);

export default router;
