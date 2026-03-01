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
├── services/             # Business logic: auth.service.ts, evaluation.service.ts, permission.service.ts
├── middleware/           # auth.middleware.ts (JWT + role/permission guards), error.middleware.ts, i18n.middleware.ts
├── config/               # prisma.ts (singleton), swagger.ts (OpenAPI spec)
├── i18n/                 # Translation files: en.json, ar.json
├── types/                # Shared TypeScript types (AuthRequest, JwtPayload, etc.)
└── utils/                # Utility helpers

frontend/src/
├── app/                  # Next.js App Router pages
│   ├── dashboard/        # Main dashboard
│   ├── evaluations/      # Evaluation CRUD ([id]/, new/)
│   ├── reports/          # Reports & analytics
│   ├── admin/            # Admin dashboard + job-titles/
│   ├── auth/login/       # Login page
│   └── team/             # Team management
├── components/
│   ├── ui/               # Reusable UI components (Toast, DialogProvider, etc.)
│   ├── auth/             # HasPermission wrapper component
│   ├── evaluation/       # CriteriaCard, EvaluationPDF, ScoreSelector
│   ├── dashboard/        # Charts & widgets
│   └── reports/          # PDF/Excel export
├── hooks/
│   ├── useAuth.tsx       # Auth context provider + hook
│   └── useAppSettings.tsx # App-wide settings (name, logo) fetched from /api/settings
├── lib/
│   ├── api.ts            # Axios client with Bearer token injection + 401 auto-refresh
│   └── utils.ts          # cn(), getScoreColor(), getPerformanceColor(), getStatusColor(), getLevelLabel(), formatDate()
├── types/                # Shared frontend TypeScript types
├── middleware.ts          # Next.js middleware: locale detection + cookie setting
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
draft → self_submitted → [senior_submitted →] manager_submitted → final_approved
                                                               ↘ revision_requested → (back to earlier stage)
                                                                                     archived
```
- Senior stage is **optional**: if `evaluatee.seniorId` is null, flow goes `self_submitted → manager_submitted` directly.
- `manager_submitted` uses **chain traversal** via `Evaluation.currentReviewerId`: `submitManager()` looks up the current reviewer's own `managerId`. If null → `final_approved`; otherwise stays `manager_submitted` with `currentReviewerId` set to the next manager in chain.
- `currentReviewerId` is set to `evaluatee.managerId` at evaluation creation; old evaluations without it fall back to legacy `dept_approved` flow (`approveDept()` kept for backward compatibility).
- There is also a parallel `calculated` status for multi-evaluation aggregates (see below).

`EvaluationScore` captures scores per `(evaluationId, criteriaId, stage)` where `stage ∈ {self, senior, manager, calculated}`, enforced by a composite unique constraint. Evaluations are unique per `(evaluateeId, evaluationPeriodId)`.

Soft delete: `Evaluation.isDeleted` flag is set instead of a hard delete; `listAll()` accepts `includeDeleted` query param.

`overallScore` is currently the arithmetic mean of all `EvaluationScore.score` values; `performanceRating` is derived from it. `JobTitle` stores `howWeight` (default 0.60) and `behaviorWeight` (default 0.40) for future weighted composite scoring.

Ratings: Outstanding (4.5–5.0), Exceeds (3.5–4.4), Meets (2.5–3.4), Below (1.5–2.4), Needs Improvement (1.0–1.4)

### Multi-Evaluation Calculation
`POST /api/evaluations/calculated` (requires `evaluations:create_calculated` permission) creates a synthetic aggregate evaluation from ≥2 source evaluations belonging to the same employee. Logic in `EvaluationService.createCalculated()`:
1. For each source evaluation, pick the best-available stage score per criteria (manager → senior → self)
2. Average those best scores per criteria across all source evaluations
3. Set `overallScore` = mean of all per-criteria averages
4. Persist as a new `Evaluation` with `isCalculated=true`, `sourceEvaluationIds=[...]`, `status='calculated'`, and `evaluationPeriodId=null`
5. Score rows written with `stage='calculated'`

Source evaluations with `isCalculated=true` cannot be used as inputs. `EvaluationScore.score` is `Decimal(4,2)` — always cast to `Number()` before arithmetic (Prisma returns `Decimal` objects, not plain numbers).

### Database Relations — Key Concepts
- **Role vs JobTitle**: Users carry two separate concepts:
  - `roleId` → custom `Role` (many-to-many `RolePermission`) — controls feature access
  - `jobTitleId` → `JobTitle` — determines which `EvaluationCriteria` applies
  - `User.role` (enum) — legacy coarse-grained field used directly in `authorize()` guards
- **User level duality**: `User.level` is a legacy `EmployeeLevel` enum (junior/mid_level/senior); `User.levelId` points to a dynamic `Level` entity scoped to a `Role` (unique name per role). The dynamic level is preferred; the enum is kept for backward compat.
- `EvaluationCriteria` ↔ `JobTitle` via `JobTitleCriteria` junction (with optional per-job `weight` and `displayOrder`). `EvaluationCriteria.scoringGuide` is a JSON object mapping score values to descriptive text.
- `RefreshToken` model stores token string + `expiresAt` in the DB; login/register create them, logout deletes them
- `AppSettings` — singleton model (id always `"singleton"`) for app-wide config (appName, logoUrl); auto-created with defaults on first read
- `EvaluationAudit` — append-only audit trail for evaluation status transitions
- `PermissionAuditLog` — append-only audit trail for role/permission assignment changes (separate from `EvaluationAudit`)
- `Evaluation.evaluationPeriodId` is nullable — calculated evaluations (via `POST /calculated`) have no period; `Evaluation.calculatedPeriodName` stores the human-readable period label for display
- `Evaluation.isCalculated` / `sourceEvaluationIds` — mark and trace multi-source aggregate evaluations
- `EvaluationScore.score` is `Decimal(4,2)` — Prisma returns a `Decimal` object; wrap in `Number()` before arithmetic

### Error Handling
- `AppError` class (extends `Error`) carries `statusCode` and `isOperational` flag
- Routes use try-catch → `next(error)` pattern consistently
- Global error handler in `middleware/error.middleware.ts` maps `AppError` to its status code; unexpected errors return 500
- Backend error messages are localized via `req.t('key')` (attached by `i18n.middleware.ts` from cookie or `Accept-Language` header)

### Frontend Utilities
- `lib/api.ts` exports typed API namespaces (`authApi`, `usersApi`, `evaluationsApi`, `criteriaApi`, `jobTitlesApi`, `departmentsApi`, `periodsApi`, `reportsApi`, `teamsApi`, `rolesApi`, `permissionsApi`, `levelsApi`, `settingsApi`) plus `getApiErrorMessage()` to extract error messages from nested Axios error responses
- `lib/utils.ts` exports: `cn()` (clsx + tailwind-merge), `getScoreColor()`, `getPerformanceColor()`, `getStatusColor()`, `getLevelLabel()`, `formatDate()`
- No runtime request validation library (Zod, Yup, etc.) — backend uses basic truthiness checks; database constraints enforce uniqueness
- `useAppSettings` hook fetches `/api/settings` (public endpoint, no auth required) on mount and provides app name/logo throughout the UI
- PDF export: `@react-pdf/renderer` via `<EvaluationPDF>` and `<JobTitlePreviewPDF>` components, rendered client-side with `<PDFDownloadLink>`
- Excel export: `xlsx` library used directly in page components (e.g., evaluation detail page)

### Testing
There is no test setup — no jest.config, vitest.config, or `.test`/`.spec` files exist in the src directories.

## API Base Routes
- Auth: `/api/auth/*`
- Evaluations: `/api/evaluations/*`; `POST /api/evaluations/calculated` (aggregate)
- Criteria: `/api/criteria/*`
- Periods: `/api/periods/*`
- Reports: `/api/reports/*`
- Teams: `/api/teams/*`, Departments: `/api/departments/*`
- Users: `/api/users/*`; `GET ?includeInactive=true` lists deactivated users; `PATCH /:id/activate` restores them
- Roles: `/api/roles/*`, Levels: `/api/levels/*`, Permissions: `/api/permissions/*`
- Job Titles: `/api/job-titles/*`
- Settings: `/api/settings/*` (GET is public; PUT requires admin)
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
- `BACKEND_INTERNAL_URL` - Docker-only: internal service URL used for server-side requests within the Docker network (e.g., `http://backend:3001/api`)

## Test Credentials (after seeding)
```
admin@example.com / admin123
manager@example.com / manager123
junior@example.com / tester123
```



