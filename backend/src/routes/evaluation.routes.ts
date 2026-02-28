import { Router, Response, NextFunction } from 'express';
import { EvaluationStatus } from '@prisma/client';
import { EvaluationService } from '../services/evaluation.service';
import { authenticate, authorize, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Evaluation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         evaluateeId:
 *           type: string
 *         evaluatorId:
 *           type: string
 *         evaluationPeriodId:
 *           type: string
 *         status:
 *           type: string
 *         score:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * tags:
 *   name: Evaluations
 *   description: Evaluation management endpoints
 */

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/evaluations:
 *   post:
 *     summary: Create a new evaluation
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - evaluateeId
 *               - evaluationPeriodId
 *             properties:
 *               evaluateeId:
 *                 type: string
 *               evaluationPeriodId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Evaluation created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Evaluation'
 */
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { evaluateeId, evaluationPeriodId } = req.body;

    if (!evaluateeId || !evaluationPeriodId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const evaluation = await EvaluationService.create(
      { evaluateeId, evaluationPeriodId },
      { userId: req.user!.userId, role: req.user!.role }
    );

    res.status(201).json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Create calculated evaluation from multiple source evaluations
router.post('/calculated', hasPermission('evaluations:create_calculated'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { evaluationIds } = req.body;
    const evaluation = await EvaluationService.createCalculated(evaluationIds, req.user!);
    res.status(201).json(evaluation);
  } catch (error) {
    next(error);
  }
});

// List evaluations
/**
 * @swagger
 * /api/evaluations:
 *   get:
 *     summary: List evaluations
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: evaluateeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: evaluatorId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of evaluations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Evaluation'
 */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { evaluateeId, evaluatorId, periodId, status } = req.query;

    const evaluations = await EvaluationService.list(
      {
        evaluateeId: evaluateeId as string,
        evaluatorId: evaluatorId as string,
        periodId: periodId as string,
        status: status as EvaluationStatus | undefined,
      },
      {
        userId: req.user!.userId,
        role: req.user!.role,
      }
    );

    res.json(evaluations);
  } catch (error) {
    next(error);
  }
});

// List all evaluations (admin only)
router.get(
  '/all',
  hasPermission('evaluations:view_all'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const includeDeleted = (req.query.includeDeleted as string) === 'true';
      const evaluations = await EvaluationService.listAll(includeDeleted);
      res.json(evaluations);
    } catch (error) {
      next(error);
    }
  }
);

// List all detailed evaluations (admin only) - for export
router.get(
  '/all/detailed',
  hasPermission('evaluations:view_all'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const includeDeleted = (req.query.includeDeleted as string) === 'true';
      const evaluations = await EvaluationService.listAllDetailed(includeDeleted);
      res.json(evaluations);
    } catch (error) {
      next(error);
    }
  }
);

// Get evaluation by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const evaluation = await EvaluationService.getById(
      req.params.id as string,
      {
        userId: req.user!.userId,
        role: req.user!.role,
      }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Save scores
router.post('/:id/scores', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { scores } = req.body;

    if (!scores || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'Scores array required' });
    }

    const result = await EvaluationService.saveScores(
      req.params.id as string,
      scores,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Submit self-evaluation
router.post('/:id/submit-self', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { selfComments } = req.body;
    const evaluation = await EvaluationService.submitSelf(
      req.params.id as string,
      selfComments,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Submit senior evaluation
router.post('/:id/submit-senior', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { seniorComments, seniorFeedback } = req.body;
    const evaluation = await EvaluationService.submitSenior(
      req.params.id as string,
      seniorComments,
      seniorFeedback,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Submit manager evaluation
router.post('/:id/submit-manager', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { managerComments, managerFeedback } = req.body;
    const evaluation = await EvaluationService.submitManager(
      req.params.id as string,
      managerComments,
      managerFeedback,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Approve department evaluation
router.post('/:id/approve-dept', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { notes } = req.body;
    const evaluation = await EvaluationService.approveDept(
      req.params.id as string,
      notes,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Request revision
router.post('/:id/request-revision', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { notes } = req.body;
    const evaluation = await EvaluationService.requestRevision(
      req.params.id as string,
      notes,
      { userId: req.user!.userId, role: req.user!.role }
    );
    res.json(evaluation);
  } catch (error) {
    next(error);
  }
});

// Compare self vs manager evaluation
router.get(
  '/compare/:evaluateeId/:periodId',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Authorization check
      if ((req.user!.role === 'junior' || req.user!.role === 'senior') && req.user!.userId !== req.params.evaluateeId) {
        return res.status(403).json({ error: 'Not authorized to view this comparison' });
      }

      // Note: For Manager, we'd ideally check if evaluatee is in their team. 
      // For now, let's keep it simple as the User one is the most critical.

      const comparison = await EvaluationService.compare(
        req.params.evaluateeId as string,
        req.params.periodId as string
      );
      res.json(comparison);
    } catch (error) {
      next(error);
    }
  }
);

// Delete evaluation (soft delete / archive)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await EvaluationService.delete(
      req.params.id as string,
      req.user!.userId,
      req.user!.role
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Bulk delete evaluations (soft delete / archive)
router.post(
  '/bulk-delete',
  hasPermission('evaluations:archive'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs array required' });
      }
      const result = await EvaluationService.bulkDelete(ids, req.user!.role);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Bulk hard delete evaluations (admin only - permanent deletion)
router.post(
  '/bulk-permanent-delete',
  hasPermission('evaluations:delete'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs array required' });
      }
      const result = await EvaluationService.bulkHardDelete(ids, req.user!.role);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Hard delete evaluation (admin only - permanent deletion)
router.delete(
  '/:id/permanent',
  hasPermission('evaluations:delete'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await EvaluationService.hardDelete(
        req.params.id as string,
        req.user!.userId,
        req.user!.role
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Update evaluation (manager comments, etc.)
router.patch(
  '/:id',
  authorize('team_manager', 'senior', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { managerComments } = req.body;
      const evaluation = await EvaluationService.update(
        req.params.id as string,
        { managerComments },
        { userId: req.user!.userId, role: req.user!.role }
      );
      res.json(evaluation);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
