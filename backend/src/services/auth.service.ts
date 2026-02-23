import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { JwtPayload } from '../types';
import { AppError } from '../middleware/error.middleware';
import { UserRole, EmployeeLevel } from '@prisma/client';
import { PermissionService } from './permission.service';

export class AuthService {
  private static generateTokens(payload: JwtPayload) {
    const accessOptions: SignOptions = { expiresIn: '15m' };
    const refreshOptions: SignOptions = { expiresIn: '7d' };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, accessOptions);

    const refreshToken = jwt.sign(
      { ...payload, tokenId: uuidv4() },
      process.env.JWT_REFRESH_SECRET!,
      refreshOptions
    );

    return { accessToken, refreshToken };
  }

  static async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    level?: EmployeeLevel;
    roleId?: string;
    levelId?: string;
  }) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role || 'junior',
        level: data.level,
        roleId: data.roleId,
        levelId: data.levelId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        level: true,
        roleId: true,
        levelId: true,
      },
    });

    const permissions = await PermissionService.getUserPermissions(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      level: user.level || undefined,
      permissions,
    };

    const tokens = this.generateTokens(payload);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      user: { ...user, permissions },
      ...tokens
    };
  }

  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    const permissions = await PermissionService.getUserPermissions(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      level: user.level || undefined,
      permissions,
    };

    const tokens = this.generateTokens(payload);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        level: user.level,
        roleId: user.roleId,
        levelId: user.levelId,
        permissions,
      },
      ...tokens,
    };
  }

  static async refreshTokens(refreshToken: string) {
    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      ) as JwtPayload & { tokenId: string };

      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Delete old refresh token
      await prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      const permissions = await PermissionService.getUserPermissions(storedToken.user.id);

      const payload: JwtPayload = {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        level: storedToken.user.level || undefined,
        permissions,
      };

      const tokens = this.generateTokens(payload);

      // Store new refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: storedToken.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return tokens;
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }
  }

  static async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        level: true,
        yearsExperience: true,
        avatarUrl: true,
        roleId: true,
        levelId: true,
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        dynamicRole: { select: { id: true, name: true } },
        dynamicLevel: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const permissions = await PermissionService.getUserPermissions(user.id);

    return { ...user, permissions };
  }
}
