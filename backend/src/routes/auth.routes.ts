import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         role:
 *           type: string
 *         level:
 *           type: string
 *     AuthResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 *         message:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *               level:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing required fields
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, role, level } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: req.t('validation.missingFields') });
    }

    const result = await AuthService.register({
      email,
      password,
      firstName,
      lastName,
      role,
      level,
    });

    res.status(201).json({ ...result, message: req.t('auth.registrationSuccess') });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: req.t('validation.missingFields') });
    }

    const result = await AuthService.login(email, password);
    res.json({ ...result, message: req.t('auth.loginSuccess') });
  } catch (error: any) {
    // Translate common auth errors
    if (error.statusCode === 401 || error.message?.includes('Invalid')) {
      return res.status(401).json({ error: req.t('auth.invalidCredentials') });
    }
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: req.t('validation.requiredField') });
    }

    const tokens = await AuthService.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (error: any) {
    if (error.statusCode === 401) {
      return res.status(401).json({ error: req.t('auth.invalidToken') });
    }
    next(error);
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.json({ message: req.t('auth.logoutSuccess') });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await AuthService.getProfile(req.user!.userId);
    res.json(user);
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: req.t('auth.userNotFound') });
    }
    next(error);
  }
});

export default router;
