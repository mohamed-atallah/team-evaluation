import { Router, Response, NextFunction } from 'express';
import { PeriodStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { authenticate, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticate);

// Get all periods
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;

    const where = status ? { status: status as PeriodStatus } : {};
    const periods = await prisma.evaluationPeriod.findMany({
      where,
      include: {
        creator: { select: { firstName: true, lastName: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    res.json(periods);
  } catch (error) {
    next(error);
  }
});

// Get active period
router.get('/active', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const activePeriod = await prisma.evaluationPeriod.findFirst({
      where: { status: 'active' },
    });

    if (!activePeriod) {
      throw new AppError('No active evaluation period found', 404);
    }

    res.json(activePeriod);
  } catch (error) {
    next(error);
  }
});

// Get period by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: req.params.id as string },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        evaluations: {
          select: {
            id: true,
            status: true,
            evaluatee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!period) {
      return res.status(404).json({ error: 'Period not found' });
    }

    res.json(period);
  } catch (error) {
    next(error);
  }
});

// Create period (admin only)
router.post(
  '/',
  hasPermission('admin:manage_periods'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, startDate, endDate } = req.body;

      if (!name || !startDate || !endDate) {
        return res.status(400).json({ error: 'Name, start date, and end date required' });
      }

      const period = await prisma.evaluationPeriod.create({
        data: {
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'inactive',
          createdBy: req.user!.userId,
        },
      });

      res.status(201).json(period);
    } catch (error) {
      next(error);
    }
  }
);

// Update period (admin only)
router.put(
  '/:id',
  hasPermission('admin:manage_periods'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, startDate, endDate } = req.body;

      const period = await prisma.evaluationPeriod.update({
        where: { id: req.params.id as string },
        data: {
          ...(name !== undefined && { name }),
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate && { endDate: new Date(endDate) }),
        },
      });

      res.json(period);
    } catch (error) {
      next(error);
    }
  }
);

// Toggle period status (admin only)
router.patch(
  '/:id/toggle-status',
  hasPermission('admin:manage_periods'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;

      if (!['active', 'inactive', 'upcoming'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be active, inactive, or upcoming.' });
      }

      const period = await prisma.evaluationPeriod.update({
        where: { id: req.params.id as string },
        data: { status },
        include: {
          creator: { select: { firstName: true, lastName: true } },
          _count: { select: { evaluations: true } },
        },
      });

      res.json(period);
    } catch (error) {
      next(error);
    }
  }
);

// Get period statistics
router.get('/:id/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const evaluations = await prisma.evaluation.findMany({
      where: { evaluationPeriodId: req.params.id as string },
      select: {
        status: true,
        overallScore: true,
      },
    });

    const stats = {
      total: evaluations.length,
      completed: evaluations.filter((e) => ['dept_approved', 'final_approved'].includes(e.status)).length,
      pending: evaluations.filter((e) => !['dept_approved', 'final_approved', 'archived'].includes(e.status)).length,
      averageScore:
        evaluations.filter((e) => e.overallScore).reduce((sum, e) => sum + Number(e.overallScore), 0) /
        evaluations.filter((e) => e.overallScore).length || 0,
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Delete period (admin only)
router.delete(
  '/:id',
  hasPermission('admin:manage_periods'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Check if period is linked to evaluations
      const count = await prisma.evaluation.count({
        where: { evaluationPeriodId: req.params.id as string },
      });

      if (count > 0) {
        return res.status(400).json({ error: 'Cannot delete period linked to evaluations' });
      }

      await prisma.evaluationPeriod.delete({
        where: { id: req.params.id as string },
      });

      res.json({ message: 'Period deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
