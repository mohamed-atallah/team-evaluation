import { Router, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, authorize, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';
import bcrypt from 'bcryptjs';

const router = Router();

const sanitizeId = (val: unknown) => (val === '' ? null : val as string | null);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */

router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
router.get(
  '/',
  hasPermission('admin:manage_users'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { teamId, level, role, roleId, levelId } = req.query;

      const where: any = { isActive: true };
      if (teamId) where.teamId = teamId;
      if (level) where.level = level;
      if (role) where.role = role;
      if (roleId) where.roleId = roleId;
      if (levelId) where.levelId = levelId;

      // Managers can only see their team members
      if (['team_manager', 'department_manager'].includes(req.user!.role)) {
        where.managerId = req.user!.userId;
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          level: true,
          roleId: true,
          levelId: true,
          jobTitleId: true,
          managerId: true,
          yearsExperience: true,
          team: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          dynamicRole: { select: { id: true, name: true } },
          dynamicLevel: { select: { id: true, name: true } },
          jobTitle: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { firstName: 'asc' },
      });

      res.json(users);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        level: true,
        roleId: true,
        levelId: true,
        jobTitleId: true,
        managerId: true,
        yearsExperience: true,
        avatarUrl: true,
        team: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        jobTitle: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        dynamicRole: { select: { id: true, name: true } },
        dynamicLevel: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Create user (admin only)
router.post(
  '/',
  hasPermission('admin:manage_users'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        role,
        level,
        teamId,
        managerId,
        yearsExperience,
        roleId,
        levelId,
        jobTitleId,
        departmentId,
        seniorId
      } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new AppError('Email already registered', 400);
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: role || 'junior',
          level,
          roleId: sanitizeId(roleId),
          levelId: sanitizeId(levelId),
          jobTitleId: sanitizeId(jobTitleId),
          teamId: sanitizeId(teamId),
          managerId: sanitizeId(managerId),
          departmentId: sanitizeId(departmentId),
          seniorId: sanitizeId(seniorId),
          yearsExperience: yearsExperience === '' ? null : yearsExperience,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          level: true,
          roleId: true,
          levelId: true,
          teamId: true,
          managerId: true,
          jobTitleId: true,
          departmentId: true,
          seniorId: true,
          yearsExperience: true,
        },
      });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
);

// Update user
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      firstName,
      lastName,
      level,
      teamId,
      managerId,
      yearsExperience,
      avatarUrl,
      role,
      email,
      roleId,
      levelId,
      departmentId,
      jobTitleId,
      seniorId
    } = req.body;

    // Only admin can update role, or user can update their own profile
    if (req.user!.userId !== (req.params.id as string) && req.user!.role !== 'admin') {
      throw new AppError('Not authorized', 403);
    }

    const data: any = {
      firstName,
      lastName,
      level,
      roleId: sanitizeId(roleId),
      levelId: sanitizeId(levelId),
      teamId: sanitizeId(teamId),
      managerId: sanitizeId(managerId),
      departmentId: sanitizeId(departmentId),
      jobTitleId: sanitizeId(jobTitleId),
      seniorId: sanitizeId(seniorId),
      yearsExperience: yearsExperience === '' ? null : yearsExperience,
      avatarUrl,
    };

    if (req.user!.role === 'admin') {
      if (role) data.role = role;
      if (email) data.email = email;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        level: true,
        roleId: true,
        levelId: true,
        teamId: true,
        managerId: true,
        jobTitleId: true,
        departmentId: true,
        seniorId: true,
        yearsExperience: true,
      },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Deactivate user (admin only)
router.delete(
  '/:id',
  hasPermission('admin:manage_users'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;

      // Check if user is linked to any evaluations (received or given)
      const evaluationsCount = await prisma.evaluation.count({
        where: {
          OR: [
            { evaluateeId: id },
            { evaluatorId: id }
          ]
        }
      });

      if (evaluationsCount > 0) {
        throw new AppError('Cannot delete user linked to existing evaluations', 400);
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      res.json({ message: 'User deactivated' });
    } catch (error) {
      next(error);
    }
  }
);

// Reset user password (admin only)
router.patch(
  '/:id/reset-password',
  hasPermission('admin:reset_user_password'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = req.body;

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        throw new AppError('Password must be at least 6 characters', 400);
      }

      const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);

      await prisma.user.update({
        where: { id: req.params.id as string },
        data: { passwordHash },
      });

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Get user's evaluations
router.get('/:id/evaluations', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const evaluations = await prisma.evaluation.findMany({
      where: { evaluateeId: req.params.id as string },
      include: {
        evaluationPeriod: { select: { id: true, name: true } },
        evaluator: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(evaluations);
  } catch (error) {
    next(error);
  }
});

// Get team members (for managers)
router.get(
  '/team/members',
  hasPermission('view:team'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const members = await prisma.user.findMany({
        where: {
          OR: [
            { managerId: req.user!.userId },
            { seniorId: req.user!.userId },
            { team: { managerId: req.user!.userId } },
            { department: { managerId: req.user!.userId } }
          ],
          isActive: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          level: true,
          team: { select: { id: true, name: true } },
          dynamicLevel: { select: { id: true, name: true } },
          jobTitle: { select: { id: true, name: true } },
        },
      });

      res.json(members);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
