import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

const SINGLETON_ID = 'singleton';

// GET /api/settings — public, no auth required (frontend needs this on every load)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });
    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { id: SINGLETON_ID, appName: 'EvalPro' },
      });
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings — admin only
router.put(
  '/',
  authenticate,
  authorize('admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { appName, logoUrl } = req.body;

      const data: { appName?: string; logoUrl?: string | null } = {};
      if (appName !== undefined) data.appName = String(appName).trim() || 'EvalPro';
      if (logoUrl !== undefined) data.logoUrl = logoUrl || null;

      const settings = await prisma.appSettings.upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, appName: data.appName ?? 'EvalPro', logoUrl: data.logoUrl ?? null },
        update: data,
      });

      res.json(settings);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
