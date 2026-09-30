import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../../utils/apiResponse.js';

const router = Router();

/** GET /health — liveness + DB readiness probe. */
router.get('/', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  sendSuccess(
    res,
    {
      status: 'ok',
      uptime: process.uptime(),
      db: dbState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
    'Service healthy',
  );
});

export default router;
