import prisma from '../config/prisma';
import { AppError } from '../middleware/error.middleware';
import { CreateEvaluationInput, ScoreInput } from '../types';
import { EvaluationStatus, Prisma } from '@prisma/client';

export class EvaluationService {
  static async create(data: CreateEvaluationInput, currentUser: { userId: string; role: string }) {
    // Basic validation
    if (!data.evaluateeId || !data.evaluationPeriodId) {
      throw new AppError('Evaluatee ID and Period ID are required', 400);
    }

    // Authorization check: only evaluatees themselves or admins can create an initial evaluation record
    // Actually, usually a manager or admin creates the period and evaluations are auto-created or created when user starts.
    if (currentUser.role === 'junior' || currentUser.role === 'senior') {
      if (data.evaluateeId !== currentUser.userId) {
        throw new AppError('You can only create evaluations for yourself', 403);
      }
    }

    const evaluatee = await prisma.user.findUnique({
      where: { id: data.evaluateeId },
    });

    if (!evaluatee) {
      throw new AppError('Evaluatee not found', 404);
    }

    // Any employee below manager-level must have at least a senior reviewer or a direct manager
    if (!evaluatee.seniorId && !evaluatee.managerId) {
      const isManagerLevel = ['team_manager', 'department_manager', 'admin', 'manager'].includes(evaluatee.role);
      if (!isManagerLevel) {
        throw new AppError('Cannot create evaluation: Employee must be assigned a Senior or Direct Manager', 400);
      }
    }

    // Check if criteria defined for the user's job title
    if (!evaluatee.jobTitleId) {
      throw new AppError('Cannot create evaluation: Evaluatee does not have a job title assigned', 400);
    }

    const criteriaCount = await prisma.evaluationCriteria.count({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: evaluatee.jobTitleId
          }
        }
      },
    });

    if (criteriaCount === 0) {
      throw new AppError('Cannot create evaluation: No active criteria defined for this user\'s job title', 400);
    }

    // Check if evaluation already exists for this user/period
    const existingEvaluation = await prisma.evaluation.findUnique({
      where: {
        evaluateeId_evaluationPeriodId: {
          evaluateeId: data.evaluateeId,
          evaluationPeriodId: data.evaluationPeriodId,
        },
      },
    });

    if (existingEvaluation) {
      return existingEvaluation; // Just return existing if it exists
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        evaluateeId: data.evaluateeId,
        evaluationPeriodId: data.evaluationPeriodId,
        status: 'draft',
        seniorId: evaluatee.seniorId,
        evaluatorId: evaluatee.managerId, // Initial manager/evaluator
      },
      include: {
        evaluatee: {
          select: { id: true, firstName: true, lastName: true, role: true, jobTitleId: true, levelId: true },
        },
        evaluationPeriod: true,
      },
    });

    await this.createAuditLog(evaluation.id, currentUser.userId, 'created', null, 'Evaluation record initialized');

    return evaluation;
  }

  static async getById(id: string, currentUser: { userId: string; role: string; email?: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            jobTitleId: true,
            levelId: true,
            teamId: true,
            managerId: true,
            seniorId: true,
            departmentId: true,
            jobTitle: { select: { id: true, name: true } },
            team: { select: { id: true, name: true, managerId: true } },
            department: { select: { id: true, name: true, managerId: true } },
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        evaluationPeriod: true,
        scores: {
          include: {
            criteria: true,
          },
        },
        auditLog: {
          include: { user: { select: { firstName: true, lastName: true, role: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
    });

    if (!evaluation) {
      throw new AppError('Evaluation not found', 404);
    }

    // Authorization check
    let isAuthorized = currentUser.role === 'admin';
    let isEvaluatee = false, isSenior = false, isTeamManager = false, isDeptManager = false;

    if (!isAuthorized) {
      isEvaluatee = evaluation.evaluateeId === currentUser.userId;
      const isEvaluator = evaluation.evaluatorId === currentUser.userId;
      isSenior = evaluation.evaluatee.seniorId === currentUser.userId;
      isTeamManager = evaluation.evaluatee.managerId === currentUser.userId;

      // Check if user manages the evaluatee's team
      let isTeamLead = false;
      if (evaluation.evaluatee.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: evaluation.evaluatee.teamId, managerId: currentUser.userId }
        });
        isTeamLead = !!team;
      }

      // For department manager, check via direct departmentId OR via team → team's department
      isDeptManager = await this.isDepartmentManagerOf(
        { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
        currentUser.userId
      );

      isAuthorized = isEvaluatee || isEvaluator || isSenior || isTeamManager || isTeamLead || isDeptManager;
    }

    if (isAuthorized) {
      // Auto-heal missing overallScore for submitted evaluations
      if (!evaluation.overallScore && !['draft', 'revision_requested'].includes(evaluation.status)) {
        let bestStage: 'manager' | 'senior' | 'self' | null = null;
        if (evaluation.status === 'manager_submitted' || evaluation.status === 'dept_approved' || evaluation.status === 'final_approved') {
          bestStage = 'manager';
        } else if (evaluation.status === 'senior_submitted') {
          bestStage = 'senior';
        } else if (evaluation.status === 'self_submitted') {
          bestStage = 'self';
        }

        if (bestStage) {
          const stageScores = evaluation.scores.filter(s => s.stage === bestStage);
          if (stageScores.length > 0) {
            const total = stageScores.reduce((sum, s) => sum + Number(s.score), 0);
            const avg = total / stageScores.length;
            const rating = this.getPerformanceRating(avg);

            const updated = await prisma.evaluation.update({
              where: { id: id },
              data: { overallScore: avg, performanceRating: rating }
            });
            evaluation.overallScore = updated.overallScore;
            evaluation.performanceRating = updated.performanceRating;
          }
        }
      }
      return evaluation;
    }

    throw new AppError('You are not authorized to view this evaluation', 403);
  }

  static async list(
    filters: {
      evaluateeId?: string;
      evaluatorId?: string;
      periodId?: string;
      status?: EvaluationStatus;
    },
    currentUser: { userId: string; role: string }
  ) {
    const where: any = { isDeleted: false };

    if (filters.evaluateeId) where.evaluateeId = filters.evaluateeId;
    if (filters.periodId) where.evaluationPeriodId = filters.periodId;
    if (filters.status) where.status = filters.status;

    // Apply role-based visibility rules
    if (currentUser.role === 'admin') {
      // Admins see everything
    } else if (['department_manager', 'team_manager', 'senior'].includes(currentUser.role)) {
      // Managers and Seniors see:
      // 1. Their own evaluations
      // 2. Evaluations where they are the evaluator
      // 3. Evaluations of people they manage directly (managerId or seniorId)
      // 4. Evaluations of people in teams they manage
      // 5. Evaluations of people in departments they manage
      where.OR = [
        { evaluateeId: currentUser.userId },
        { evaluatorId: currentUser.userId },
        { evaluatee: { managerId: currentUser.userId } },
        { evaluatee: { seniorId: currentUser.userId } },
        { evaluatee: { team: { managerId: currentUser.userId } } },
        { evaluatee: { department: { managerId: currentUser.userId } } },
        // Also include evaluations of members whose team belongs to a department managed by this user
        { evaluatee: { team: { department: { managerId: currentUser.userId } } } },
      ];
    } else {
      // Juniors see only their own
      where.evaluateeId = currentUser.userId;
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatee: {
          select: { id: true, firstName: true, lastName: true, level: true, levelId: true, dynamicLevel: { select: { id: true, name: true, roleId: true } } },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluationPeriod: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return evaluations;
  }

  static async listAll(includeDeleted: boolean = false) {
    const where: any = {};
    if (!includeDeleted) {
      where.isDeleted = false;
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            level: true,
            levelId: true,
            dynamicLevel: { select: { id: true, name: true, roleId: true } },
            email: true,
            team: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluationPeriod: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return evaluations;
  }

  static async listAllDetailed(includeDeleted: boolean = false) {
    const where: any = {};
    if (!includeDeleted) {
      where.isDeleted = false;
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            level: true,
            levelId: true,
            dynamicLevel: { select: { id: true, name: true, roleId: true } },
            email: true,
            team: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            yearsExperience: true,
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluationPeriod: { select: { id: true, name: true } },
        scores: {
          include: {
            criteria: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return evaluations;
  }

  static async saveScores(
    evaluationId: string,
    scores: ScoreInput[],
    currentUser: { userId: string; role: string }
  ) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { evaluatee: true }
    });

    if (!evaluation) {
      throw new AppError('Evaluation not found', 404);
    }

    // Determine the stage based on current status or explicit stage in input
    let stage: 'self' | 'senior' | 'manager' = scores[0]?.stage || 'self';

    // Authorization check for saving scores at specific stages
    if (stage === 'self') {
      if (evaluation.evaluateeId !== currentUser.userId && currentUser.role !== 'admin') {
        throw new AppError('Only the evaluatee can save self-evaluation scores', 403);
      }
      if (!['draft', 'revision_requested'].includes(evaluation.status) && currentUser.role !== 'admin') {
        throw new AppError('Self-evaluation scores can only be saved in draft or revision stage', 400);
      }
    } else if (stage === 'senior') {
      const isDirectSenior = evaluation.evaluatee.seniorId === currentUser.userId;
      const isEvaluator = evaluation.evaluatorId === currentUser.userId;
      const hasSeniorRole = ['senior', 'team_manager', 'department_manager', 'admin'].includes(currentUser.role);
      if (currentUser.role !== 'admin' && (!(isDirectSenior || isEvaluator) || !hasSeniorRole)) {
        throw new AppError('Only the authorized Senior can save senior-level scores', 403);
      }
      if (evaluation.status !== 'self_submitted' && currentUser.role !== 'admin') {
        throw new AppError('Senior scores can only be saved after self-submission', 400);
      }
    } else if (stage === 'manager') {
      const isDirectManager = evaluation.evaluatee.managerId === currentUser.userId;

      let isTeamManager = false;
      if (evaluation.evaluatee.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: evaluation.evaluatee.teamId, managerId: currentUser.userId }
        });
        isTeamManager = !!team;
      }

      const isDeptManager = await this.isDepartmentManagerOf(
        { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
        currentUser.userId
      );

      const hasManagerRole = ['team_manager', 'department_manager', 'admin'].includes(currentUser.role);

      if (currentUser.role !== 'admin' && (!hasManagerRole || (!isDirectManager && !isTeamManager && !isDeptManager))) {
        throw new AppError('Only the authorized Team Manager can save manager-level scores', 403);
      }

      // Enforce stage ordering: manager can only score after the appropriate prior stage
      if (currentUser.role !== 'admin') {
        const hasSenior = !!evaluation.evaluatee.seniorId;
        const blockedStatuses = ['draft', 'revision_requested', ...(hasSenior ? ['self_submitted'] : [])];
        if (blockedStatuses.includes(evaluation.status)) {
          throw new AppError(
            `Manager scores can only be saved after ${hasSenior ? 'senior' : 'self'} submission`,
            400
          );
        }
      }
    }

    // Validate scores are between 1-5
    for (const score of scores) {
      if (score.score < 1 || score.score > 5) {
        throw new AppError('Scores must be between 1 and 5', 400);
      }
    }

    // Upsert scores
    const results = await Promise.all(
      scores.map((score) =>
        prisma.evaluationScore.upsert({
          where: {
            evaluationId_criteriaId_stage: {
              evaluationId,
              criteriaId: score.criteriaId,
              stage: score.stage || 'self',
            },
          },
          update: {
            score: score.score,
            evidence: score.evidence,
            comments: score.comments,
          },
          create: {
            evaluationId,
            criteriaId: score.criteriaId,
            score: score.score,
            evidence: score.evidence,
            comments: score.comments,
            stage: score.stage || 'self',
          },
        })
      )
    );

    // Update the overall score based on the current stage being saved
    await this.updateOverallStatus(evaluationId, stage);

    return results;
  }

  private static async updateOverallStatus(evaluationId: string, stage: 'self' | 'senior' | 'manager') {
    const scores = await prisma.evaluationScore.findMany({
      where: { evaluationId, stage },
    });

    if (scores.length > 0) {
      const totalScore = scores.reduce((sum, s) => sum + Number(s.score), 0);
      const overallScore = totalScore / scores.length;
      const performanceRating = this.getPerformanceRating(overallScore);

      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { overallScore, performanceRating },
      });
    }
  }

  static async submitSelf(evaluationId: string, comments: string, currentUser: { userId: string; role: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { scores: { where: { stage: 'self' } }, evaluatee: true },
    });

    if (!evaluation) throw new AppError('Evaluation not found', 404);
    if (evaluation.evaluateeId !== currentUser.userId && currentUser.role !== 'admin') {
      throw new AppError('You can only submit your own self-evaluation', 403);
    }

    if (!evaluation.evaluatee.jobTitleId) {
      throw new AppError('Evaluatee does not have a job title assigned', 400);
    }

    const criteriaCount = await prisma.evaluationCriteria.count({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: evaluation.evaluatee.jobTitleId
          }
        }
      },
    });

    if (evaluation.scores.length < criteriaCount) {
      throw new AppError('All criteria must be scored before submitting self-evaluation', 400);
    }

    // Update overall score before submitting
    await this.updateOverallStatus(evaluationId, 'self');

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'self_submitted',
        selfComments: comments,
        submittedAt: new Date(),
      },
    });

    const hasSenior = !!evaluation.evaluatee.seniorId;
    const nextStepNote = hasSenior
      ? 'Awaiting senior review'
      : 'Awaiting direct manager review (senior stage skipped – no senior assigned)';
    await this.createAuditLog(evaluationId, currentUser.userId, 'self_submitted', null, `Self-evaluation submitted – ${nextStepNote}`);

    return updated;
  }

  static async submitSenior(evaluationId: string, comments: string, feedback: string, currentUser: { userId: string; role: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { scores: { where: { stage: 'senior' } }, evaluatee: true },
    });

    if (!evaluation) throw new AppError('Evaluation not found', 404);
    if (currentUser.role !== 'admin') {
      const isSenior = evaluation.evaluatee.seniorId === currentUser.userId;
      const hasSeniorRole = ['senior', 'team_manager', 'department_manager'].includes(currentUser.role);
      if (!isSenior || !hasSeniorRole) {
        throw new AppError('Only the assigned Senior (or someone with Senior role) can submit this stage', 403);
      }
      if (evaluation.status !== 'self_submitted') {
        throw new AppError('Senior evaluation can only be submitted after self-evaluation is submitted', 400);
      }
    }

    if (!evaluation.evaluatee.jobTitleId) {
      throw new AppError('Evaluatee does not have a job title assigned', 400);
    }

    const criteriaCount = await prisma.evaluationCriteria.count({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: evaluation.evaluatee.jobTitleId
          }
        }
      },
    });

    if (evaluation.scores.length < criteriaCount) {
      throw new AppError('All criteria must be scored by Senior before submitting', 400);
    }

    // Update overall score before submitting
    await this.updateOverallStatus(evaluationId, 'senior');

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'senior_submitted',
        seniorComments: comments,
        seniorFeedback: feedback,
      },
    });

    await this.createAuditLog(evaluationId, currentUser.userId, 'senior_submitted', null, 'Senior evaluation submitted');

    return updated;
  }

  static async submitManager(evaluationId: string, comments: string, feedback: string, currentUser: { userId: string; role: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { scores: { where: { stage: 'manager' } }, evaluatee: true },
    });

    if (!evaluation) throw new AppError('Evaluation not found', 404);

    if (currentUser.role !== 'admin') {
      const isDirectManager = evaluation.evaluatee.managerId === currentUser.userId;

      let isTeamManager = false;
      if (evaluation.evaluatee.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: evaluation.evaluatee.teamId, managerId: currentUser.userId }
        });
        isTeamManager = !!team;
      }

      const isDeptManagerForSubmit = await this.isDepartmentManagerOf(
        { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
        currentUser.userId
      );

      const hasManagerRole = ['team_manager', 'department_manager'].includes(currentUser.role);

      if (!hasManagerRole || (!isDirectManager && !isTeamManager && !isDeptManagerForSubmit)) {
        throw new AppError('Only an authorized Team Manager can submit this stage', 403);
      }

      // Enforce stage ordering based on whether a senior is assigned
      const hasSenior = !!evaluation.evaluatee.seniorId;
      const requiredPriorStatus = hasSenior ? 'senior_submitted' : 'self_submitted';
      if (evaluation.status !== requiredPriorStatus) {
        throw new AppError(
          hasSenior
            ? 'Manager review can only be submitted after the senior has completed their review'
            : 'Manager review can only be submitted after the employee has submitted their self-evaluation',
          400
        );
      }
    }

    if (!evaluation.evaluatee.jobTitleId) {
      throw new AppError('Evaluatee does not have a job title assigned', 400);
    }

    const criteriaCount = await prisma.evaluationCriteria.count({
      where: {
        isActive: true,
        jobTitles: {
          some: {
            jobTitleId: evaluation.evaluatee.jobTitleId
          }
        }
      },
    });

    if (evaluation.scores.length < criteriaCount) {
      throw new AppError('All criteria must be scored by Manager before submitting', 400);
    }

    // Calculate final score using the helper
    const totalScore = evaluation.scores.reduce((sum, s) => sum + Number(s.score), 0);
    const overallScore = totalScore / evaluation.scores.length;
    const performanceRating = this.getPerformanceRating(overallScore);

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'manager_submitted',
        managerComments: comments,
        managerFeedback: feedback,
        overallScore,
        performanceRating,
        reviewedAt: new Date(),
      },
    });

    const hasSeniorForAudit = !!evaluation.evaluatee.seniorId;
    const auditNote = hasSeniorForAudit
      ? 'Team Manager review submitted'
      : 'Team Manager review submitted (Senior stage skipped – no assigned senior)';
    await this.createAuditLog(evaluationId, currentUser.userId, 'manager_submitted', null, auditNote);

    return updated;
  }

  static async approveDept(evaluationId: string, notes: string, currentUser: { userId: string; role: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { evaluatee: true }
    });

    if (!evaluation) throw new AppError('Evaluation not found', 404);

    // Check if user is Dept Manager — via direct departmentId or via team → team's department
    const isActingDeptManager = await this.isDepartmentManagerOf(
      { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
      currentUser.userId
    );

    if (!isActingDeptManager && currentUser.role !== 'admin') {
      throw new AppError('Only the Department Manager can approve this evaluation', 403);
    }

    if (evaluation.status !== 'manager_submitted' && currentUser.role !== 'admin') {
      throw new AppError('Department approval can only be done after the manager has submitted their review', 400);
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'dept_approved',
        deptApprovalNotes: notes,
      },
    });

    await this.createAuditLog(evaluationId, currentUser.userId, 'dept_approved', null, 'Department Manager approved');

    return updated;
  }

  static async requestRevision(evaluationId: string, notes: string, currentUser: { userId: string; role: string }) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { evaluatee: true }
    });

    if (!evaluation) throw new AppError('Evaluation not found', 404);

    // Permission check: DM, TM, or Senior can request revision depending on current stage
    let isSuperior = currentUser.role === 'admin';
    if (!isSuperior) {
      const isDirectSuperior = evaluation.evaluatee.managerId === currentUser.userId || evaluation.evaluatee.seniorId === currentUser.userId;

      let isTeamManager = false;
      if (evaluation.evaluatee.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: evaluation.evaluatee.teamId, managerId: currentUser.userId }
        });
        isTeamManager = !!team;
      }

      const isDeptManager = await this.isDepartmentManagerOf(
        { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
        currentUser.userId
      );

      isSuperior = isDirectSuperior || isTeamManager || isDeptManager;
    }

    if (!isSuperior) {
      throw new AppError('You are not authorized to request revision', 403);
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'revision_requested',
      },
    });

    await this.createAuditLog(evaluationId, currentUser.userId, 'revision_requested', null, notes);

    return updated;
  }

  static async createAuditLog(evaluationId: string, userId: string, action: string, changes: any, notes: string) {
    return prisma.evaluationAudit.create({
      data: {
        evaluationId,
        userId,
        action,
        changes: changes || undefined,
        notes,
      },
    });
  }

  static async compare(evaluateeId: string, periodId: string) {
    const evaluation = await prisma.evaluation.findUnique({
      where: {
        evaluateeId_evaluationPeriodId: {
          evaluateeId,
          evaluationPeriodId: periodId,
        },
      },
      include: {
        scores: { include: { criteria: true } },
        evaluator: { select: { firstName: true, lastName: true } },
      },
    });

    if (!evaluation) return null;

    // Group scores by stage for comparison
    const scoresByStage = evaluation.scores.reduce((acc: any, score) => {
      if (!acc[score.stage]) acc[score.stage] = [];
      acc[score.stage].push(score);
      return acc;
    }, {});

    return {
      evaluation,
      scoresByStage,
    };
  }

  static async delete(evaluationId: string, userId: string, userRole: string) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new AppError('Evaluation not found', 404);
    }

    // Only allow deletion by admin or the evaluator
    if (userRole !== 'admin' && evaluation.evaluatorId !== userId) {
      throw new AppError('You are not authorized to delete this evaluation', 403);
    }

    // Don't allow deletion of completed/reviewed evaluations unless admin
    if (['dept_approved', 'final_approved'].includes(evaluation.status) && userRole !== 'admin') {
      throw new AppError('Cannot delete a completed or reviewed evaluation', 400);
    }

    // Soft delete: archive the evaluation
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { isDeleted: true },
    });

    return { message: 'Evaluation archived successfully' };
  }

  static async hardDelete(evaluationId: string, userId: string, userRole: string) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        scores: true,
      },
    });

    if (!evaluation) {
      throw new AppError('Evaluation not found', 404);
    }

    // Only admin can hard delete
    if (userRole !== 'admin') {
      throw new AppError('Only administrators can permanently delete evaluations', 403);
    }

    // Delete related records first (scores, development plans)
    await prisma.evaluationScore.deleteMany({
      where: { evaluationId },
    });

    // Now delete the evaluation
    await prisma.evaluation.delete({
      where: { id: evaluationId },
    });

    return { message: 'Evaluation permanently deleted' };
  }

  static async update(
    evaluationId: string,
    data: {
      selfComments?: string;
      seniorComments?: string;
      seniorFeedback?: string;
      managerComments?: string;
      managerFeedback?: string;
      deptApprovalNotes?: string;
      status?: EvaluationStatus;
    },
    currentUser: { userId: string; role: string }
  ) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        evaluatee: { select: { id: true, managerId: true, seniorId: true, departmentId: true, teamId: true } }
      }
    });

    if (!evaluation) {
      throw new AppError('Evaluation not found', 404);
    }

    // Authorization check
    let isAuthorized = currentUser.role === 'admin';

    if (!isAuthorized) {
      const isEvaluatee = evaluation.evaluateeId === currentUser.userId;
      const isManagerOfEvaluatee = evaluation.evaluatee?.managerId === currentUser.userId;
      const isSeniorOfEvaluatee = evaluation.evaluatee?.seniorId === currentUser.userId;

      // For department manager, check via direct departmentId OR via team → team's department
      const isDeptManager = await this.isDepartmentManagerOf(
        { departmentId: evaluation.evaluatee.departmentId, teamId: evaluation.evaluatee.teamId },
        currentUser.userId
      );

      isAuthorized = isEvaluatee || isManagerOfEvaluatee || isSeniorOfEvaluatee || isDeptManager;
    }

    if (!isAuthorized) {
      throw new AppError('You are not authorized to update this evaluation', 403);
    }

    // Only allow evaluatee to update selfComments (and only in draft/revision stage)
    if (currentUser.role !== 'admin' && evaluation.evaluateeId === currentUser.userId) {
      const allowedFields = ['selfComments'];
      const dataFields = Object.keys(data);
      const isAttemptingOtherFields = dataFields.some(f => !allowedFields.includes(f));

      if (isAttemptingOtherFields) {
        throw new AppError('You can only update your self-comments', 403);
      }

      if (!['draft', 'revision_requested'].includes(evaluation.status)) {
        throw new AppError('You can only update comments in draft or revision stage', 400);
      }
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data,
    });

    return updated;
  }

  static async bulkDelete(ids: string[], userRole: string) {
    if (userRole !== 'admin') {
      throw new AppError('Only administrators can perform bulk archiving', 403);
    }

    await prisma.evaluation.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });

    return { message: `${ids.length} evaluations archived successfully` };
  }

  static async bulkHardDelete(ids: string[], userRole: string) {
    if (userRole !== 'admin') {
      throw new AppError('Only administrators can perform bulk permanent deletion', 403);
    }

    // Delete related score records before deleting evaluations
    await prisma.evaluationScore.deleteMany({
      where: { evaluationId: { in: ids } },
    });

    await prisma.evaluation.deleteMany({
      where: { id: { in: ids } },
    });

    return { message: `${ids.length} evaluations permanently deleted` };
  }

  static async createCalculated(evaluationIds: string[], currentUser: { userId: string; role: string }) {
    if (!evaluationIds || evaluationIds.length < 2) {
      throw new AppError('Select at least 2 evaluations to create a calculated evaluation', 400);
    }

    const evaluations = await prisma.evaluation.findMany({
      where: { id: { in: evaluationIds }, isDeleted: false },
      include: {
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        scores: { include: { criteria: true } },
      },
    });

    if (evaluations.length !== evaluationIds.length) {
      throw new AppError('One or more evaluations not found', 404);
    }

    // Validate all belong to the same employee
    const uniqueEvaluatees = new Set(evaluations.map(e => e.evaluateeId));
    if (uniqueEvaluatees.size > 1) {
      throw new AppError('All selected evaluations must belong to the same employee', 400);
    }

    // Reject already-calculated evaluations as sources
    if (evaluations.some(e => e.isCalculated)) {
      throw new AppError('Cannot include already-calculated evaluations as sources', 400);
    }

    const evaluateeId = evaluations[0].evaluateeId;

    // ── Step 1: Build per-criteria averages ──────────────────────────────────
    // For each source evaluation, pick the best-available stage score per
    // criteria (manager → senior → self), then average across all evals.
    // Scores are keyed by criteriaId so mapping is always by ID, never by index.
    const criteriaScoresMap = new Map<string, number[]>();
    for (const eval_ of evaluations) {
      const byStage: Record<string, Record<string, number>> = {};
      for (const s of eval_.scores) {
        if (!byStage[s.criteriaId]) byStage[s.criteriaId] = {};
        byStage[s.criteriaId][s.stage] = Number(s.score);
      }
      for (const [criteriaId, stageScores] of Object.entries(byStage)) {
        const best = stageScores['manager'] ?? stageScores['senior'] ?? stageScores['self'];
        if (best !== undefined) {
          const arr = criteriaScoresMap.get(criteriaId) || [];
          arr.push(best);
          criteriaScoresMap.set(criteriaId, arr);
        }
      }
    }

    if (criteriaScoresMap.size === 0) {
      throw new AppError('None of the selected evaluations have scores yet', 400);
    }

    // ── Step 2: Compute per-criteria averages (full decimal precision) ────────
    const criteriaAverages = new Map<string, number>();
    for (const [criteriaId, scores] of criteriaScoresMap) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      criteriaAverages.set(criteriaId, parseFloat(avg.toFixed(2)));
    }

    // ── Step 3: Overall score = mean of all per-criteria averages ────────────
    // This mirrors how regular evaluations compute overallScore
    // (mean of all score rows), keeping the metrics consistent.
    const allCriteriaAvgs = Array.from(criteriaAverages.values());
    const overallAvg = allCriteriaAvgs.reduce((a, b) => a + b, 0) / allCriteriaAvgs.length;
    const overallScore = parseFloat(overallAvg.toFixed(2));
    const performanceRating = this.getPerformanceRating(overallScore);

    // ── Step 4: Persist evaluation + per-criteria score rows ─────────────────
    const calculated = await prisma.evaluation.create({
      data: {
        evaluateeId,
        isCalculated: true,
        sourceEvaluationIds: evaluationIds,
        overallScore,
        performanceRating,
        status: 'calculated',
      },
      include: {
        evaluatee: { select: { id: true, firstName: true, lastName: true, role: true, jobTitleId: true, levelId: true } },
      },
    });

    await prisma.evaluationScore.createMany({
      data: Array.from(criteriaAverages.entries()).map(([criteriaId, avg]) => ({
        evaluationId: calculated.id,
        criteriaId,
        stage: 'calculated' as const,
        score: avg,   // Decimal(4,2) — preserves e.g. 3.50
      })),
    });

    await this.createAuditLog(
      calculated.id,
      currentUser.userId,
      'calculated',
      null,
      `Calculated from ${evaluationIds.length} evaluations — ${criteriaAverages.size} criteria averaged, overall=${overallScore}`
    );

    return calculated;
  }

  private static getPerformanceRating(score: number): string {
    if (score >= 4.5) return 'Outstanding';
    if (score >= 3.5) return 'Exceeds Expectations';
    if (score >= 2.5) return 'Meets Expectations';
    if (score >= 1.5) return 'Below Expectations';
    return 'Needs Significant Improvement';
  }

  /**
   * Checks whether `managerId` is the department manager of the given evaluatee.
   * Resolves via two paths:
   *   1. Evaluatee's direct departmentId → Department.managerId
   *   2. Evaluatee's teamId → Team.departmentId → Department.managerId
   * This handles the common case where an employee's departmentId is not set directly
   * on the user record but is implied by their team membership.
   */
  static async isDepartmentManagerOf(
    evaluatee: { departmentId: string | null; teamId: string | null },
    managerId: string
  ): Promise<boolean> {
    // Path 1: direct departmentId on the user
    if (evaluatee.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: evaluatee.departmentId, managerId },
      });
      if (dept) return true;
    }

    // Path 2: via team → team's departmentId
    if (evaluatee.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: evaluatee.teamId },
        select: { departmentId: true },
      });
      if (team?.departmentId) {
        const dept = await prisma.department.findFirst({
          where: { id: team.departmentId, managerId },
        });
        if (dept) return true;
      }
    }

    return false;
  }
}
