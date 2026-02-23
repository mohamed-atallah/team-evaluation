# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Team Evaluation App (EvalPro) - A full-stack web application for evaluating employees based on their job titles with automated scoring, reports, and development plans. Evaluation criteria are assigned per job title (e.g., Tester, Picker, Stocker, Supervisor), separate from the user's system permissions role.

## Tech Stack

- **Backend:** Express.js 5 + TypeScript + Prisma ORM + PostgreSQL
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Auth:** JWT with refresh tokens (15min access / 7d refresh), stored in `localStorage`
- **i18n:** next-intl (English & Arabic with RTL support); locale stored in cookie, detected from `Accept-Language` header

## Development Commands

### Backend (`/backend`)
```bash
npm run dev              # Start dev server (port 3001)
npm run build            # Compile TypeScript to dist/
npm run db:generate      # Generate Prisma Client
npm run db:migrate       # Create new migration
npm run db:push          # Push schema to DB (no migration)
npm run db:seed          # Seed with demo data
npm run db:studio        # Open Prisma Studio GUI
npm run db:reset         # Reset database (destructive)
```

### Frontend (`/frontend`)
```bash
npm run dev              # Start Next.js dev server (port 3000)
npm run build            # Build for production
npm run lint             # Run ESLint
```

### Docker
```bash
docker-compose up --build   # Start all services (db on 5434, backend 3001, frontend 3000)
docker-compose down
```

### Initial Setup
```bash
cd backend && npm install && npx prisma db push && npm run db:seed
cd ../frontend && npm install
```

## Architecture

```
backend/src/
├── index.ts              # Express app entry, middleware setup, all route mounts
├── routes/               # API endpoints (one file per domain)
├── services/             # Business logic (evaluation, auth, competency, permission, reviewer)
├── middleware/           # auth.middleware.ts (JWT + role/permission guards), error, i18n, telescope
├── config/               # prisma.ts (singleton), swagger.ts (OpenAPI spec)
├── types/                # Shared TypeScript types (AuthRequest, JwtPayload, etc.)
└── utils/                # Utility helpers

frontend/src/
├── app/                  # Next.js App Router pages
│   ├── dashboard/        # Main dashboard
│   ├── evaluations/      # Evaluation CRUD
│   ├── reports/          # Reports & analytics
│   ├── admin/            # Admin dashboard + job-titles/[id]/competencies/
│   ├── auth/login/       # Login page
│   ├── team/             # Team management
│   ├── 360-feedback/     # 360-degree feedback flows (+ [evaluationId]/)
│   ├── competencies/     # Competency management (+ [id]/, [id]/edit/, new/)
│   └── telescope/        # Request monitoring dashboard
├── components/
│   ├── ui/               # Reusable UI components (Toast, DialogProvider, etc.)
│   ├── auth/             # HasPermission wrapper component
│   ├── evaluation/       # Evaluation-specific components (evaluations/ has [id]/, new/, [id]/reviewers/)
│   ├── dashboard/        # Charts & widgets
│   ├── performance/      # Performance components
│   └── reports/          # PDF/Excel export
├── hooks/useAuth.tsx     # Auth context provider + hook
├── lib/api.ts            # Axios client with Bearer token injection + 401 auto-refresh
├── middleware.ts         # Next.js middleware: locale detection + cookie setting
└── i18n/config.ts        # Locale list, direction map (en: ltr, ar: rtl)
```

`app/providers.tsx` wraps the entire app with `AuthProvider → DialogProvider → ToastProvider`.

## Key Patterns

### Authentication & Authorization
- Backend middleware: `authenticate` (JWT validation) → `authorize(...roles)` (role enum check) or `hasPermission(name)` / `hasAnyPermission(...names)` for fine-grained control; `authorizeOwnerOrRole` for self-or-role checks
- All authenticated routes apply `router.use(authenticate)` at the router level — individual handlers receive `AuthRequest` with `req.user` already populated; specific permission guards are added per endpoint on mutating operations
- `UserRole` enum values: `admin`, `manager`, `department_manager`, `team_manager`, `senior`, `junior` (used in both `User.role` legacy field and `authorize()` guards)
- Frontend: `AuthProvider` in `providers.tsx` exposes `useAuth()` hook with `user`, `login`, `logout`, `hasPermission(name)`, `isAuthenticated`; token auto-refreshed on 401 via Axios interceptor
- `components/auth/HasPermission` — renders children based on `user.permissions`; accepts a `fallback` prop for denied state

### Dual Role Architecture
Users carry two separate authorization concepts that coexist:
- `User.role` (enum) — coarse-grained, checked by `authorize()` guards
- `User.roleId` → custom `Role` entity with many-to-many `RolePermission` — fine-grained feature access
- `PermissionService.getUserPermissions()` merges permissions from both `User.roleId` and `UserRoleRelation` (many-to-many), deduplicates, and **auto-grants `view:team`** to any user who manages others (via `managerId`, `seniorId`, managed teams, or managed departments). This runs at login/refresh and is not cached.

### User Hierarchy
- `User.managerId` → their team manager (department_manager / team_manager role)
- `User.seniorId` → their senior reviewer (senior role); juniors must have a senior OR manager before an evaluation can be created
- `User.teamId` / `User.departmentId` → organizational placement

### Evaluation Lifecycle
Multi-stage status flow enforced in `EvaluationService`:
```
draft → self_submitted → senior_submitted → manager_submitted → dept_approved → final_approved
                                                              ↘ revision_requested → (back to earlier stage)
                                                                                    archived
```
`EvaluationScore` captures scores per `(evaluationId, criteriaId, stage)` where `stage ∈ {self, senior, manager}`, enforced by a composite unique constraint. Evaluations are unique per `(evaluateeId, evaluationPeriodId)`.

Soft delete: `Evaluation.isDeleted` flag is set instead of a hard delete; `listAll()` accepts `includeDeleted` query param.

### Composite Scoring: WHAT × HOW
Each evaluation produces a final `overallScore` combining two pillars:
- **HOW** (`howScore`): Performance on individual objectives/KPIs — weighted by `howWeight` (default **0.60**)
- **BEHAVIOR** (`behaviorScore`): Competency assessments (self + peer + senior + manager) — weighted by `behaviorWeight` (default **0.40**)

Both weights are stored on `JobTitle` and copied onto each `Evaluation` at creation time. The formula is `overallScore = behaviorScore * behaviorWeight + howScore * howWeight`.

Ratings: Outstanding (4.5–5.0), Exceeds (3.5–4.4), Meets (2.5–3.4), Below (1.5–2.4), Needs Improvement (1.0–1.4)

### Database Relations — Key Concepts
- **Role vs JobTitle**: Users carry two separate concepts:
  - `roleId` → custom `Role` (many-to-many `RolePermission`) — controls feature access
  - `jobTitleId` → `JobTitle` — determines which `EvaluationCriteria` and `BehavioralCompetency` apply
  - `User.role` (enum) — legacy coarse-grained field used directly in `authorize()` guards
- `EvaluationCriteria` ↔ `JobTitle` via `JobTitleCriteria` junction (with optional per-job `weight` and `displayOrder`)
- `BehavioralCompetency` ↔ `JobTitle` via `JobTitleCompetency` (with `expectedLevel`)
- `DevelopmentPlan` is 1:1 with `Evaluation`; `GoalProgress` tracks updates to it
- `RefreshToken` model stores token string + `expiresAt` in the DB; login/register create them, logout deletes them

### Error Handling
- `AppError` class (extends `Error`) carries `statusCode` and `isOperational` flag
- Routes use try-catch → `next(error)` pattern consistently
- Global error handler in `middleware/error.middleware.ts` maps `AppError` to its status code; unexpected errors return 500
- Backend error messages are localized via `req.t('key')` (attached by `i18n.middleware.ts` from cookie or `Accept-Language` header)

### 360-Degree Feedback
`EvaluationReviewer` assigns `peer` or `subordinate` reviewers (optionally anonymous) to an evaluation. Reviewers submit `PeerCompetencyAssessment` records; aggregation (`triggerAggregation`) rolls up peer/subordinate scores into `Evaluation.peerBehaviorScore` / `subordinateBehaviorScore`.

### Frontend Utilities
- `lib/api.ts` exports typed API namespaces (`authApi`, `usersApi`, `evaluationsApi`, `criteriaApi`, `jobTitlesApi`, etc.) plus `getApiErrorMessage()` to extract error messages from nested Axios error responses
- `lib/utils.ts` exports: `cn()` (clsx + tailwind-merge), `getScoreColor()`, `getPerformanceColor()`, `getStatusColor()`, `getLevelLabel()`, `formatDate()`
- No runtime request validation library (Zod, Yup, etc.) — backend uses basic truthiness checks; database constraints enforce uniqueness

### Telescope (Request Logging)
- `telescopeMiddleware` logs every non-telescope API request to the DB (method, path, status, duration, user, request/response body with password scrubbed)
- Viewable at `/api/telescope` (backend) and `/telescope` (frontend dashboard)

### Testing
There is no test setup — no jest.config, vitest.config, or `.test`/`.spec` files exist in the src directories.

## API Base Routes
- Auth: `/api/auth/*`
- Evaluations: `/api/evaluations/*`
- Criteria: `/api/criteria/*`
- Periods: `/api/periods/*`
- Reports: `/api/reports/*`
- Plans: `/api/plans/*`
- Teams: `/api/teams/*`, Departments: `/api/departments/*`
- Users: `/api/users/*`
- Roles: `/api/roles/*`, Levels: `/api/levels/*`, Permissions: `/api/permissions/*`
- Job Titles: `/api/job-titles/*`
- Competencies: `/api/competencies/*`
- Reviewers: `/api/reviewers/*`
- Telescope: `/api/telescope/*`
- API Docs (Swagger UI): `/api-docs`
- Health: `/api/health`

## Environment Variables

**Backend (.env):**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` - Token signing keys
- `PORT` (default: 3001)
- `FRONTEND_URL` - For CORS

**Frontend (.env.local):**
- `NEXT_PUBLIC_API_URL` - Backend API base URL (default: `http://localhost:3001/api`)

## Test Credentials (after seeding)
```
admin@example.com / admin123
manager@example.com / manager123
junior@example.com / tester123
```
