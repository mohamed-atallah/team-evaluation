import { Router, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, hasPermission, hasAnyPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticate);

// List all departments
router.get(
  '/',
  hasAnyPermission('view:team', 'admin:manage_departments'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const departments = await prisma.department.findMany({
        include: {
          teams: {
            select: { id: true, name: true },
          },
          _count: {
            select: { teams: true, users: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.json(departments);
    } catch (error) {
      next(error);
    }
  }
);

// Get department by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const department = await prisma.department.findUnique({
      where: { id: req.params.id as string },
      include: {
        teams: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { members: true } },
          },
        },
        users: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            level: true,
          },
        },
      },
    });

    if (!department) {
      throw new AppError('Department not found', 404);
    }

    res.json(department);
  } catch (error) {
    next(error);
  }
});

// Create department (admin only)
router.post(
  '/',
  hasPermission('admin:manage_departments'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        throw new AppError('Department name is required', 400);
      }

      const existing = await prisma.department.findUnique({ where: { name } });
      if (existing) {
        throw new AppError('Department with this name already exists', 400);
      }

      const department = await prisma.department.create({
        data: { name, description },
      });

      res.status(201).json(department);
    } catch (error) {
      next(error);
    }
  }
);

// Update department (admin only)
router.put(
  '/:id',
  hasPermission('admin:manage_departments'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body;

      const department = await prisma.department.update({
        where: { id: req.params.id as string },
        data: { name, description },
      });

      res.json(department);
    } catch (error) {
      next(error);
    }
  }
);

// Delete department (admin only)
router.delete(
  '/:id',
  hasPermission('admin:manage_departments'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Check if department has teams or users
      const department = await prisma.department.findUnique({
        where: { id: req.params.id as string },
        include: {
          _count: { select: { teams: true, users: true } },
        },
      });

      if (!department) {
        throw new AppError('Department not found', 404);
      }

      if (department._count.teams > 0 || department._count.users > 0) {
        throw new AppError('Cannot delete department with teams or users', 400);
      }

      await prisma.department.delete({
        where: { id: req.params.id as string },
      });

      res.json({ message: 'Department deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
