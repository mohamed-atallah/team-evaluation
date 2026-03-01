import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { authenticate, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticate);

// Get all criteria
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { jobTitleId } = req.query;

    const where: Prisma.EvaluationCriteriaWhereInput = { isActive: true };

    // If jobTitleId is provided, filter by job title through junction table
    if (jobTitleId) {
      where.jobTitles = {
        some: {
          jobTitleId: jobTitleId as string
        }
      };
    }

    const criteria = await prisma.evaluationCriteria.findMany({
      where,
      include: {
        jobTitles: {
          include: {
            jobTitle: { select: { id: true, name: true, description: true } }
          },
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { displayOrder: 'asc' },
    });

    res.json(criteria);
  } catch (error) {
    next(error);
  }
});

// Get criteria by job title
router.get('/job-title/:jobTitleId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobTitleId = req.params.jobTitleId;

    const criteria = await prisma.evaluationCriteria.findMany({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: jobTitleId as string
          }
        }
      },
      include: {
        jobTitles: {
          where: { jobTitleId: jobTitleId as string },
          include: {
            jobTitle: { select: { id: true, name: true, description: true } }
          }
        }
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Transform the response to include job title-specific metadata
    const transformedCriteria = criteria.map(criterion => ({
      ...criterion,
      jobTitleDisplayOrder: criterion.jobTitles[0]?.displayOrder || criterion.displayOrder,
      jobTitleWeight: criterion.jobTitles[0]?.weight || criterion.weight,
    }));

    res.json(transformedCriteria);
  } catch (error) {
    next(error);
  }
});

// Get single criterion
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const criterion = await prisma.evaluationCriteria.findUnique({
      where: { id: req.params.id as string },
      include: {
        jobTitles: {
          include: {
            jobTitle: { select: { id: true, name: true, description: true } }
          }
        }
      },
    });

    if (!criterion) {
      throw new AppError('Criterion not found', 404);
    }

    res.json(criterion);
  } catch (error) {
    next(error);
  }
});

// Create criterion (admin only)
router.post(
  '/',
  hasPermission('admin:manage_criteria'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        description,
        behavioralIndicators,
        scoringGuide,
        weight,
        displayOrder,
        jobTitleIds, // Array of job title IDs to assign this criterion to
      } = req.body;

      // Validate required fields
      if (!name || !description || !behavioralIndicators || !scoringGuide) {
        return res.status(400).json({
          error: 'name, description, behavioralIndicators, and scoringGuide are required'
        });
      }

      // Check uniqueness per job title
      if (jobTitleIds && Array.isArray(jobTitleIds) && jobTitleIds.length > 0) {
        const duplicate = await prisma.evaluationCriteria.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
            jobTitles: { some: { jobTitleId: { in: jobTitleIds } } },
          },
        });
        if (duplicate) {
          return res.status(409).json({ error: 'A criterion with this name already exists for one of the selected job titles' });
        }
      }

      // Create criterion with optional job title assignments
      const criterion = await prisma.evaluationCriteria.create({
        data: {
          name,
          description,
          behavioralIndicators,
          scoringGuide,
          weight: weight || 1.0,
          displayOrder: displayOrder || 0,
          jobTitles: jobTitleIds && Array.isArray(jobTitleIds) && jobTitleIds.length > 0 ? {
            create: jobTitleIds.map((jobTitleId: string, index: number) => ({
              jobTitleId,
              displayOrder: displayOrder || index,
              weight: weight || undefined,
            }))
          } : undefined
        },
        include: {
          jobTitles: {
            include: {
              jobTitle: { select: { id: true, name: true, description: true } }
            }
          }
        }
      });

      res.status(201).json(criterion);
    } catch (error: any) {
      next(error);
    }
  }
);

// Update criterion (admin only)
router.put(
  '/:id',
  hasPermission('admin:manage_criteria'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        description,
        behavioralIndicators,
        scoringGuide,
        weight,
        displayOrder,
        isActive,
        jobTitleIds, // Optional: Array of job title IDs to assign this criterion to
      } = req.body;

      // Check uniqueness per job title on update
      if (name !== undefined && jobTitleIds && Array.isArray(jobTitleIds) && jobTitleIds.length > 0) {
        const duplicate = await prisma.evaluationCriteria.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
            id: { not: req.params.id as string },
            jobTitles: { some: { jobTitleId: { in: jobTitleIds } } },
          },
        });
        if (duplicate) {
          return res.status(409).json({ error: 'A criterion with this name already exists for one of the selected job titles' });
        }
      }

      // Build update data
      const updateData: Prisma.EvaluationCriteriaUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (behavioralIndicators !== undefined) updateData.behavioralIndicators = behavioralIndicators;
      if (scoringGuide !== undefined) updateData.scoringGuide = scoringGuide;
      if (weight !== undefined) updateData.weight = weight;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      // If jobTitleIds are provided, update job title assignments
      if (jobTitleIds && Array.isArray(jobTitleIds)) {
        updateData.jobTitles = {
          deleteMany: {},
          create: jobTitleIds.map((jobTitleId: string, index: number) => ({
            jobTitleId,
            displayOrder: displayOrder || index,
            weight: weight || undefined,
          }))
        };
      }

      const criterion = await prisma.evaluationCriteria.update({
        where: { id: req.params.id as string },
        data: updateData,
        include: {
          jobTitles: {
            include: {
              jobTitle: { select: { id: true, name: true, description: true } }
            }
          }
        }
      });

      res.json(criterion);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Criterion not found' });
      }
      next(error);
    }
  }
);

// Delete criterion (admin only)
router.delete(
  '/:id',
  hasPermission('admin:manage_criteria'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const criterion = await prisma.evaluationCriteria.findUnique({
        where: { id: req.params.id as string },
        include: {
          _count: { select: { scores: true } },
        },
      });

      if (!criterion) {
        return res.status(404).json({ error: 'Criterion not found' });
      }

      if (criterion._count.scores > 0) {
        return res.status(400).json({
          error: 'Cannot delete criterion that has already been used in evaluations. You can only deactivate it.'
        });
      }

      await prisma.evaluationCriteria.delete({
        where: { id: req.params.id as string },
      });

      res.json({ message: 'Criterion deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Assign criterion to job title (admin only)
router.post(
  '/:id/job-titles/:jobTitleId',
  hasPermission('admin:manage_criteria'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const criteriaId = req.params.id as string;
      const jobTitleId = req.params.jobTitleId as string;
      const { displayOrder, weight } = req.body;

      // Check if assignment already exists
      const existing = await prisma.jobTitleCriteria.findUnique({
        where: {
          jobTitleId_criteriaId: {
            jobTitleId,
            criteriaId
          }
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
          jobTitle: { select: { id: true, name: true, description: true } },
          criteria: { select: { id: true, name: true } }
        }
      });

      res.status(201).json(assignment);
    } catch (error: any) {
      if (error.code === 'P2003') {
        return res.status(404).json({ error: 'Criterion or job title not found' });
      }
      next(error);
    }
  }
);

// Remove criterion from job title (admin only)
router.delete(
  '/:id/job-titles/:jobTitleId',
  hasPermission('admin:manage_criteria'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const criteriaId = req.params.id as string;
      const jobTitleId = req.params.jobTitleId as string;

      await prisma.jobTitleCriteria.delete({
        where: {
          jobTitleId_criteriaId: {
            jobTitleId,
            criteriaId
          }
        }
      });

      res.json({ message: 'Criterion removed from job title successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({
          error: 'Criterion-job title assignment not found'
        });
      }
      next(error);
    }
  }
);

// Get all job titles for a criterion
router.get(
  '/:id/job-titles',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const criteriaId = req.params.id as string;

      const jobTitleCriteria = await prisma.jobTitleCriteria.findMany({
        where: { criteriaId },
        include: {
          jobTitle: {
            select: {
              id: true,
              name: true,
              description: true,
              isActive: true
            }
          }
        },
        orderBy: { displayOrder: 'asc' }
      });

      res.json(jobTitleCriteria);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
