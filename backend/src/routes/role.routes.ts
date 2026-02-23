import { Router, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, authorize, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';
import { PermissionService } from '../services/permission.service';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Role:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         systemRole:
 *           type: string
 *         levels:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Level'
 *     Level:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         displayOrder:
 *           type: integer
 */

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management endpoints
 */

router.use(authenticate);

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Role'
 */
router.get(
    '/',
    authorize('admin', 'department_manager', 'team_manager'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const roles = await prisma.role.findMany({
                include: {
                    levels: {
                        orderBy: { displayOrder: 'asc' },
                    },
                    _count: {
                        select: { users: true },
                    },
                },
                orderBy: { name: 'asc' },
            });

            res.json(roles);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   get:
 *     summary: Get role by ID
 *     tags: [Roles]
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
 *         description: Role object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Role'
 *       404:
 *         description: Role not found
 */
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const role = await prisma.role.findUnique({
            where: { id: req.params.id as string },
            include: {
                levels: {
                    orderBy: { displayOrder: 'asc' },
                },
            },
        });

        if (!role) {
            throw new AppError('Role not found', 404);
        }

        res.json(role);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [Roles]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               systemRole:
 *                 type: string
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Role'
 *       400:
 *         description: Missing field or role already exists
 */
router.post(
    '/',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { name, description, systemRole } = req.body;

            if (!name) {
                throw new AppError('Role name is required', 400);
            }

            const existing = await prisma.role.findUnique({ where: { name } });
            if (existing) {
                throw new AppError('Role with this name already exists', 400);
            }

            const role = await prisma.role.create({
                data: { name, description, systemRole: systemRole || 'junior' },
            });

            res.status(201).json(role);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   put:
 *     summary: Update a role
 *     tags: [Roles]
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
 *               description:
 *                 type: string
 *               systemRole:
 *                 type: string
 *     responses:
 *       200:
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Role'
 */
router.put(
    '/:id',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { name, description, systemRole } = req.body;

            const role = await prisma.role.update({
                where: { id: req.params.id as string },
                data: { name, description, systemRole },
            });

            res.json(role);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [Roles]
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
 *         description: Role deleted
 *       400:
 *         description: Cannot delete role with assigned users
 *       404:
 *         description: Role not found
 */
router.delete(
    '/:id',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const role = await prisma.role.findUnique({
                where: { id: req.params.id as string },
                include: {
                    _count: { select: { users: true } },
                },
            });

            if (!role) {
                throw new AppError('Role not found', 404);
            }

            if (role._count.users > 0) {
                throw new AppError('Cannot delete role with assigned users', 400);
            }

            await prisma.role.delete({
                where: { id: req.params.id as string },
            });

            res.json({ message: 'Role deleted successfully' });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/roles/{id}/permissions:
 *   get:
 *     summary: Get role permissions
 *     tags: [Roles]
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
 *         description: List of permission IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 */
router.get(
    '/:id/permissions',
    hasPermission('admin:manage_roles'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const permissions = await PermissionService.getRolePermissions(req.params.id as string);
            res.json(permissions);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /api/roles/{id}/permissions:
 *   post:
 *     summary: Set role permissions
 *     tags: [Roles]
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
 *               - permissionIds
 *             properties:
 *               permissionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions updated successfully
 */
router.post(
    '/:id/permissions',
    hasPermission('admin:manage_roles'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { permissionIds } = req.body;
            if (!Array.isArray(permissionIds)) {
                throw new AppError('permissionIds must be an array', 400);
            }

            await PermissionService.setRolePermissions(
                req.params.id as string,
                permissionIds,
                req.user!.userId
            );

            res.json({ message: 'Permissions updated successfully' });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
