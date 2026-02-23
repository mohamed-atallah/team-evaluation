import { Router, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, hasPermission, hasAnyPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Team:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         departmentId:
 *           type: string
 *         managerId:
 *           type: string
 *         department:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         manager:
 *           $ref: '#/components/schemas/User'
 *         members:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *     Department:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         _count:
 *           type: object
 *           properties:
 *             teams:
 *               type: integer
 *             users:
 *               type: integer
 */

/**
 * @swagger
 * tags:
 *   name: Teams
 *   description: Team management endpoints
 */

router.use(authenticate);

/**
 * @swagger
 * /api/teams:
 *   get:
 *     summary: List all teams
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter teams by department ID
 *     responses:
 *       200:
 *         description: List of teams
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Team'
 */
router.get(
  '/',
  hasAnyPermission('view:team', 'admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { departmentId } = req.query;

      const where: any = {};
      if (departmentId) where.departmentId = departmentId;

      const teams = await prisma.team.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true, email: true } },
          members: {
            where: { isActive: true },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              level: true,
              role: true,
            },
          },
          _count: {
            select: { members: { where: { isActive: true } } },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.json(teams);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/{id}:
 *   get:
 *     summary: Get team by ID
 *     tags: [Teams]
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
 *         description: Team object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 *       404:
 *         description: Team not found
 */
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id as string },
      include: {
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        members: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            level: true,
            role: true,
            yearsExperience: true,
          },
        },
      },
    });

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    res.json(team);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/teams:
 *   post:
 *     summary: Create a new team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - departmentId
 *             properties:
 *               name:
 *                 type: string
 *               departmentId:
 *                 type: string
 *               managerId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Team created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 *       400:
 *         description: Missing fields or invalid manager
 */
router.post(
  '/',
  hasPermission('admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, departmentId, managerId } = req.body;

      if (!name || !departmentId) {
        throw new AppError('Name and department are required', 400);
      }

      // Validate manager belongs to the same department and has manager role
      if (managerId) {
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
          select: { role: true, departmentId: true },
        });

        if (!manager) {
          throw new AppError('Manager not found', 404);
        }

        if (!['team_manager', 'department_manager'].includes(manager.role)) {
          throw new AppError('Selected user is not a manager', 400);
        }

        if (manager.departmentId !== departmentId) {
          throw new AppError('Manager must belong to the same department as the team', 400);
        }
      }

      const team = await prisma.team.create({
        data: {
          name,
          departmentId,
          managerId,
        },
        include: {
          department: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      res.status(201).json(team);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/{id}:
 *   put:
 *     summary: Update a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               departmentId:
 *                 type: string
 *               managerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Team updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 */
router.put(
  '/:id',
  hasPermission('admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, departmentId, managerId } = req.body;

      // Get current team to determine effective departmentId
      const currentTeam = await prisma.team.findUnique({
        where: { id: req.params.id as string },
        select: { departmentId: true },
      });

      if (!currentTeam) {
        throw new AppError('Team not found', 404);
      }

      const effectiveDepartmentId = departmentId || currentTeam.departmentId;

      // Validate manager belongs to the same department and has manager role
      if (managerId) {
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
          select: { role: true, departmentId: true },
        });

        if (!manager) {
          throw new AppError('Manager not found', 404);
        }

        if (!['team_manager', 'department_manager'].includes(manager.role)) {
          throw new AppError('Selected user is not a manager', 400);
        }

        if (manager.departmentId !== effectiveDepartmentId) {
          throw new AppError('Manager must belong to the same department as the team', 400);
        }
      }

      const team = await prisma.team.update({
        where: { id: req.params.id as string },
        data: {
          name,
          departmentId,
          managerId,
        },
        include: {
          department: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      res.json(team);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/{id}:
 *   delete:
 *     summary: Delete a team
 *     tags: [Teams]
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
 *         description: Team deleted successfully
 */
router.delete(
  '/:id',
  hasPermission('admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Reassign members to null before deleting team
      await prisma.user.updateMany({
        where: { teamId: req.params.id as string },
        data: { teamId: null },
      });

      await prisma.team.delete({
        where: { id: req.params.id as string },
      });

      res.json({ message: 'Team deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/{id}/members:
 *   post:
 *     summary: Add member to team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added
 */
router.post(
  '/:id/members',
  hasPermission('admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;

      const user = await prisma.user.update({
        where: { id: userId },
        data: { teamId: req.params.id as string },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/{id}/members/{userId}:
 *   delete:
 *     summary: Remove member from team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete(
  '/:id/members/:userId',
  hasPermission('admin:manage_teams'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await prisma.user.update({
        where: { id: req.params.userId as string },
        data: { teamId: null },
      });

      res.json({ message: 'Member removed from team' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/teams/departments/list:
 *   get:
 *     summary: List all departments
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of departments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Department'
 */
router.get(
  '/departments/list',
  hasAnyPermission('view:team', 'admin:manage_departments'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const departments = await prisma.department.findMany({
        include: {
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

export default router;
