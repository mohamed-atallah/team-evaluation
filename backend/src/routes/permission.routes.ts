import { Router, Response, NextFunction } from 'express';
import { authenticate, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { PermissionService } from '../services/permission.service';

const router = Router();

router.use(authenticate);

// List all permissions (admin only)
router.get(
    '/',
    hasPermission('admin:manage_roles'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const permissions = await PermissionService.getAllPermissions();
            res.json(permissions);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
