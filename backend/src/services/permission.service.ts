import prisma from '../config/prisma';

export class PermissionService {
    /**
     * Get all unique permissions for a user based on their roles
     */
    static async getUserPermissions(userId: string): Promise<string[]> {
        // Get permissions from all roles assigned via UserRoleRelation
        const userRoleRelations = await prisma.userRoleRelation.findMany({
            where: { userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        });

        const permissions = new Set<string>();

        userRoleRelations.forEach(relation => {
            relation.role.permissions.forEach(rp => {
                permissions.add(rp.permission.name);
            });
        });

        // Also check the direct roleId on User model (for backward compatibility/single role setup)
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                dynamicRole: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        });

        if (user?.dynamicRole) {
            user.dynamicRole.permissions.forEach(rp => {
                permissions.add(rp.permission.name);
            });
        }

        // AUTO-PERMISSION: If user is a manager/senior of someone, give them view:team
        const isLead = await prisma.user.findFirst({
            where: {
                OR: [
                    { managerId: userId },
                    { seniorId: userId },
                    { managedTeams: { some: { managerId: userId } } },
                    { managedDepartments: { some: { managerId: userId } } }
                ]
            }
        });

        if (isLead) {
            permissions.add('view:team');
        }

        return Array.from(permissions);
    }

    /**
     * Get all permissions available in the system
     */
    static async getAllPermissions() {
        return prisma.permission.findMany({
            orderBy: { name: 'asc' }
        });
    }

    /**
     * Get permissions for a specific role
     */
    static async getRolePermissions(roleId: string) {
        const rolePermissions = await prisma.rolePermission.findMany({
            where: { roleId },
            include: { permission: true }
        });
        return rolePermissions.map(rp => rp.permission);
    }

    /**
     * Set permissions for a role
     */
    static async setRolePermissions(roleId: string, permissionIds: string[], actorId: string) {
        // This should be done in a transaction
        return prisma.$transaction(async (tx) => {
            // Get current permissions for audit log
            const current = await tx.rolePermission.findMany({
                where: { roleId },
                include: { permission: true }
            });

            // Delete existing
            await tx.rolePermission.deleteMany({
                where: { roleId }
            });

            // Add new
            if (permissionIds.length > 0) {
                await tx.rolePermission.createMany({
                    data: permissionIds.map(pid => ({
                        roleId,
                        permissionId: pid
                    }))
                });
            }

            // Log the change
            await tx.permissionAuditLog.create({
                data: {
                    actorId,
                    action: 'set_role_permissions',
                    entityType: 'role',
                    entityId: roleId,
                    previousValue: current.map(rp => rp.permission.name),
                    newValue: permissionIds // We'll log IDs for now, or fetch names if needed
                }
            });

            return { success: true };
        });
    }
}
