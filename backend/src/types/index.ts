import { Request } from 'express';
import { UserRole, EmployeeLevel } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  level?: EmployeeLevel;
  roleId?: string;
  levelId?: string;
  permissions: string[];
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ScoreInput {
  criteriaId: string;
  score: number;
  evidence?: string;
  comments?: string;
  stage?: 'self' | 'senior' | 'manager';
}

export interface CreateEvaluationInput {
  evaluateeId: string;
  evaluationPeriodId: string;
}


