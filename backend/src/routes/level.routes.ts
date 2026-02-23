import { Router, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticate);

// List all levels
router.get(
    '/',
    authorize('admin', 'department_manager', 'team_manager'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { roleId } = req.query;
            const levels = await prisma.level.findMany({
                where: roleId ? { roleId: roleId as string } : {},
                include: {
                    role: { select: { id: true, name: true } },
                    _count: { select: { users: true } },
                },
                orderBy: [{ roleId: 'asc' }, { displayOrder: 'asc' }],
            });

            res.json(levels);
        } catch (error) {
            next(error);
        }
    }
);

// Create level (admin only)
router.post(
    '/',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { name, description, roleId, displayOrder } = req.body;

            if (!name || !roleId) {
                throw new AppError('Name and Role ID are required', 400);
            }

            const existing = await prisma.level.findUnique({
                where: {
                    roleId_name: { roleId, name },
                },
            });

            if (existing) {
                throw new AppError('Level with this name already exists for this role', 400);
            }

            const level = await prisma.level.create({
                data: {
                    name,
                    description,
                    roleId,
                    displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : 0,
                },
            });

            res.status(201).json(level);
        } catch (error) {
            next(error);
        }
    }
);

// Update level (admin only)
router.put(
    '/:id',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { name, description, displayOrder } = req.body;

            const level = await prisma.level.update({
                where: { id: req.params.id as string },
                data: {
                    name,
                    description,
                    displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : undefined,
                },
            });

            res.json(level);
        } catch (error) {
            next(error);
        }
    }
);

// Delete level (admin only)
router.delete(
    '/:id',
    authorize('admin'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const level = await prisma.level.findUnique({
                where: { id: req.params.id as string },
                include: {
                    _count: { select: { users: true } },
                },
            });

            if (!level) {
                throw new AppError('Level not found', 404);
            }

            if (level._count.users > 0) {
                throw new AppError('Cannot delete level with assigned users', 400);
            }

            await prisma.level.delete({
                where: { id: req.params.id as string },
            });

            res.json({ message: 'Level deleted successfully' });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
