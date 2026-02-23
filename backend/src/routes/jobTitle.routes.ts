import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { authenticate, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

router.use(authenticate);

// Get all job titles
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { departmentId, isActive } = req.query;

    const where: Prisma.JobTitleWhereInput = {};
    if (departmentId) where.departmentId = departmentId as string;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const jobTitles = await prisma.jobTitle.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        _count: {
          select: { users: true, criteria: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    res.json(jobTitles);
  } catch (error) {
    next(error);
  }
});

// Get single job title with its criteria
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const jobTitle = await prisma.jobTitle.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        criteria: {
          include: {
            criteria: true
          },
          orderBy: { displayOrder: 'asc' }
        },
        _count: {
          select: { users: true }
        }
      },
    });

    if (!jobTitle) {
      return res.status(404).json({ error: 'Job title not found' });
    }

    res.json(jobTitle);
  } catch (error) {
    next(error);
  }
});

// Get criteria for a job title
router.get('/:id/criteria', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobTitleId = req.params.id as string;

    const criteria = await prisma.evaluationCriteria.findMany({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: jobTitleId
          }
        }
      },
      include: {
        jobTitles: {
          where: { jobTitleId: jobTitleId },
        }
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Transform the response to include job-specific metadata
    const transformedCriteria = criteria.map((criterion) => ({
      ...criterion,
      jobDisplayOrder: criterion.jobTitles[0]?.displayOrder || criterion.displayOrder,
      jobWeight: criterion.jobTitles[0]?.weight || criterion.weight,
    }));

    res.json(transformedCriteria);
  } catch (error) {
    next(error);
  }
});

// Get users for a job title
router.get('/:id/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobTitleId = req.params.id as string;

    const users = await prisma.user.findMany({
      where: { jobTitleId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Create job title (admin only)
router.post(
  '/',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, departmentId, criteriaIds } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Job title name is required' });
      }

      // Create job title with optional criteria assignments
      const jobTitle = await prisma.jobTitle.create({
        data: {
          name,
          description,
          departmentId: departmentId || null,
          criteria: criteriaIds && criteriaIds.length > 0 ? {
            create: criteriaIds.map((criteriaId: string, index: number) => ({
              criteriaId,
              displayOrder: index,
            }))
          } : undefined
        },
        include: {
          department: { select: { id: true, name: true } },
          criteria: {
            include: { criteria: true }
          }
        }
      });

      res.status(201).json(jobTitle);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Job title with this name already exists' });
      }
      next(error);
    }
  }
);

// Update job title (admin only)
router.put(
  '/:id',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, departmentId, isActive, criteriaIds } = req.body;

      const updateData: Prisma.JobTitleUncheckedUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (departmentId !== undefined) updateData.departmentId = departmentId || null;
      if (isActive !== undefined) updateData.isActive = isActive;

      // If criteriaIds are provided, update criteria assignments
      if (criteriaIds && Array.isArray(criteriaIds)) {
        updateData.criteria = {
          deleteMany: {},
          create: criteriaIds.map((criteriaId: string, index: number) => ({
            criteriaId,
            displayOrder: index,
          }))
        };
      }

      const id = req.params.id as string;
      const jobTitle = await prisma.jobTitle.update({
        where: { id },
        data: updateData,
        include: {
          department: { select: { id: true, name: true } },
          criteria: {
            include: { criteria: true }
          },
          _count: { select: { users: true } }
        }
      });

      res.json(jobTitle);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Job title not found' });
      }
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Job title with this name already exists' });
      }
      next(error);
    }
  }
);

// Delete job title (admin only)
router.delete(
  '/:id',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      // Check if job title has users assigned
      const jobTitle = await prisma.jobTitle.findUnique({
        where: { id },
        include: {
          _count: { select: { users: true } }
        }
      });

      if (!jobTitle) {
        return res.status(404).json({ error: 'Job title not found' });
      }

      if (jobTitle._count.users > 0) {
        return res.status(400).json({
          error: `Cannot delete job title with ${jobTitle._count.users} assigned users. Reassign users first or deactivate the job title.`
        });
      }

      await prisma.jobTitle.delete({
        where: { id }
      });

      res.json({ message: 'Job title deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Assign criterion to job title (admin only)
router.post(
  '/:id/criteria/:criteriaId',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobTitleId = req.params.id as string;
      const criteriaId = req.params.criteriaId as string;
      const { displayOrder, weight } = req.body;

      // Check if assignment already exists
      const existing = await prisma.jobTitleCriteria.findUnique({
        where: {
          jobTitleId_criteriaId: { jobTitleId, criteriaId }
        }
      });

      if (existing) {
        return res.status(409).json({
          error: 'This criterion is already assigned to this job title'
        });
      }

      const assignment = await prisma.jobTitleCriteria.create({
        data: {
          jobTitleId,
          criteriaId,
          displayOrder: displayOrder || 0,
          weight: weight || undefined,
        },
        include: {
          jobTitle: { select: { id: true, name: true } },
          criteria: { select: { id: true, name: true } }
        }
      });

      res.status(201).json(assignment);
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(404).json({ error: 'Job title or criterion not found' });
      }
      next(error);
    }
  }
);

// Remove criterion from job title (admin only)
router.delete(
  '/:id/criteria/:criteriaId',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobTitleId = req.params.id as string;
      const criteriaId = req.params.criteriaId as string;

      await prisma.jobTitleCriteria.delete({
        where: {
          jobTitleId_criteriaId: { jobTitleId, criteriaId }
        }
      });

      res.json({ message: 'Criterion removed from job title successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({
          error: 'Job title-criterion assignment not found'
        });
      }
      next(error);
    }
  }
);

// Update criteria order for a job title (admin only)
router.put(
  '/:id/criteria/reorder',
  hasPermission('admin:manage_job_titles'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobTitleId = req.params.id as string;
      const { criteriaOrder } = req.body; // Array of { criteriaId, displayOrder }

      if (!Array.isArray(criteriaOrder)) {
        return res.status(400).json({ error: 'criteriaOrder must be an array' });
      }

      // Update each criteria's display order
      const updates = criteriaOrder.map((item: { criteriaId: string; displayOrder: number }) =>
        prisma.jobTitleCriteria.update({
          where: {
            jobTitleId_criteriaId: {
              jobTitleId,
              criteriaId: item.criteriaId
            }
          },
          data: { displayOrder: item.displayOrder }
        })
      );

      await Promise.all(updates);

      // Return updated job title with criteria
      const jobTitle = await prisma.jobTitle.findUnique({
        where: { id: jobTitleId },
        include: {
          criteria: {
            include: { criteria: true },
            orderBy: { displayOrder: 'asc' }
          }
        }
      });

      res.json(jobTitle);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
