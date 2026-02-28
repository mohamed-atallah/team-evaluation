import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { authenticate, hasPermission } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

function calcDistribution(evals: Array<{ overallScore: unknown }>) {
  const completed = evals.filter((e) => e.overallScore);
  return {
    outstanding: completed.filter((e) => Number(e.overallScore) >= 4.5).length,
    exceedsExpectations: completed.filter((e) => Number(e.overallScore) >= 3.5 && Number(e.overallScore) < 4.5).length,
    meetsExpectations: completed.filter((e) => Number(e.overallScore) >= 2.5 && Number(e.overallScore) < 3.5).length,
    belowExpectations: completed.filter((e) => Number(e.overallScore) >= 1.5 && Number(e.overallScore) < 2.5).length,
    needsImprovement: completed.filter((e) => Number(e.overallScore) < 1.5).length,
  };
}

router.use(authenticate);

// Get individual report data
router.get('/individual/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Authorization check: User can view their own report, or someone with view:reports permission can view it
    if (req.user!.userId !== (req.params.userId as string) && !req.user!.permissions.includes('view:reports')) {
      return res.status(403).json({ error: 'Not authorized to view this report' });
    }
    const periodId = req.query.periodId as string | undefined;

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId as string },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        level: true,
        yearsExperience: true,
        team: { select: { name: true } },
        department: { select: { name: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const evaluationWhere: Prisma.EvaluationWhereInput = { evaluateeId: req.params.userId as string };
    if (periodId) evaluationWhere.evaluationPeriodId = periodId;

    const evaluations = await prisma.evaluation.findMany({
      where: evaluationWhere,
      include: {
        evaluationPeriod: true,
        scores: {
          include: { criteria: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate trends if multiple periods
    const trends = evaluations
      .filter((e) => e.overallScore && e.evaluationPeriod)
      .map((e) => ({
        period: e.evaluationPeriod!.name,
        score: Number(e.overallScore),
      }));

    res.json({
      user,
      evaluations,
      trends,
      latestScore: evaluations[0]?.overallScore || null,
      latestRating: evaluations[0]?.performanceRating || null,
    });
  } catch (error) {
    next(error);
  }
});

// Get team report data (manager/admin)
router.get(
  '/team/:teamId',
  hasPermission('view:reports'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const periodId = req.query.periodId as string | undefined;

      const team = await prisma.team.findUnique({
        where: { id: req.params.teamId as string },
        include: {
          members: {
            where: { isActive: true },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              level: true,
              jobTitle: { select: { id: true, name: true } },
              dynamicLevel: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const teamWithMembers = team as typeof team & { members: Array<{ id: string; firstName: string; lastName: string; level: string | null }> };
      const memberIds = teamWithMembers.members.map((m) => m.id);

      const evaluationWhere: Prisma.EvaluationWhereInput = { evaluateeId: { in: memberIds } };
      if (periodId) evaluationWhere.evaluationPeriodId = periodId;

      const evaluations = await prisma.evaluation.findMany({
        where: evaluationWhere,
        include: {
          evaluatee: { select: { firstName: true, lastName: true, level: true } },
          evaluationPeriod: { select: { name: true } },
        },
      });

      // Calculate team statistics
      const completedEvals = evaluations.filter((e) => e.overallScore);
      const avgScore =
        completedEvals.reduce((sum, e) => sum + Number(e.overallScore), 0) / completedEvals.length || 0;

      // Score distribution
      const distribution = calcDistribution(evaluations);

      // By level breakdown
      const byLevel = {
        junior: completedEvals
          .filter((e) => e.evaluatee.level === 'junior')
          .map((e) => Number(e.overallScore)),
        mid_level: completedEvals
          .filter((e) => e.evaluatee.level === 'mid_level')
          .map((e) => Number(e.overallScore)),
        senior: completedEvals
          .filter((e) => e.evaluatee.level === 'senior')
          .map((e) => Number(e.overallScore)),
      };

      res.json({
        team: { id: team.id, name: team.name },
        memberCount: teamWithMembers.members.length,
        evaluationCount: evaluations.length,
        averageScore: avgScore.toFixed(2),
        distribution,
        byLevel: {
          junior: {
            count: byLevel.junior.length,
            avg: byLevel.junior.length
              ? (byLevel.junior.reduce((a, b) => a + b, 0) / byLevel.junior.length).toFixed(2)
              : 0,
          },
          mid_level: {
            count: byLevel.mid_level.length,
            avg: byLevel.mid_level.length
              ? (byLevel.mid_level.reduce((a, b) => a + b, 0) / byLevel.mid_level.length).toFixed(2)
              : 0,
          },
          senior: {
            count: byLevel.senior.length,
            avg: byLevel.senior.length
              ? (byLevel.senior.reduce((a, b) => a + b, 0) / byLevel.senior.length).toFixed(2)
              : 0,
          },
        },
        members: teamWithMembers.members.map((m) => {
          const memberEvals = evaluations.filter((e) => e.evaluateeId === m.id);
          const latestEval = memberEvals.find((e) => e.overallScore);
          // Find the evaluation for this specific period (if periodId is provided) or the latest one
          const currentEval = periodId
            ? memberEvals.find(e => e.evaluationPeriodId === periodId)
            : memberEvals[0];

          return {
            ...m,
            latestScore: latestEval?.overallScore || null,
            latestRating: latestEval?.performanceRating || null,
            evaluationStatus: currentEval?.status || 'not_started',
            evaluationId: currentEval?.id || null,
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get organization report data (admin only)
router.get(
  '/organization',
  hasPermission('view:reports'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const periodId = req.query.periodId as string | undefined;

      const evaluationWhere: Prisma.EvaluationWhereInput = {};
      if (periodId) evaluationWhere.evaluationPeriodId = periodId;

      const [evaluations, userCount, teamCount] = await Promise.all([
        prisma.evaluation.findMany({
          where: evaluationWhere,
          include: {
            evaluatee: {
              select: { level: true, team: { select: { id: true, name: true } } },
            },
          },
        }),
        prisma.user.count({ where: { isActive: true, role: 'junior' } }),
        prisma.team.count(),
      ]);

      const completedEvals = evaluations.filter((e) => e.overallScore);
      const avgScore =
        completedEvals.reduce((sum, e) => sum + Number(e.overallScore), 0) / completedEvals.length || 0;

      // Distribution by rating
      const distribution = calcDistribution(evaluations);

      // By team
      const teamScores = new Map<string, { name: string; scores: number[] }>();
      completedEvals.forEach((e) => {
        if (e.evaluatee.team) {
          const team = teamScores.get(e.evaluatee.team.id) || {
            name: e.evaluatee.team.name,
            scores: [],
          };
          team.scores.push(Number(e.overallScore));
          teamScores.set(e.evaluatee.team.id, team);
        }
      });

      const byTeam = Array.from(teamScores.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        count: data.scores.length,
        avgScore: (data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(2),
      }));

      res.json({
        totalUsers: userCount,
        totalTeams: teamCount,
        totalEvaluations: evaluations.length,
        completedEvaluations: completedEvals.length,
        averageScore: avgScore.toFixed(2),
        distribution,
        byTeam,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
