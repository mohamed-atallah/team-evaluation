# EvalPro Hub - Performance Management Platform

EvalPro Hub is a comprehensive, enterprise-ready performance management system designed specifically for structured organizations and testing teams. It streamlines the evaluation lifecycle through a dynamic multi-stage approval workflow, granular competency matrices, and data-driven insights.

---

## Key Features

### Advanced Evaluation Workflows
- **Dynamic Review Chain**: Evaluations route automatically through the reporting hierarchy via `currentReviewerId`. When a manager submits, the system walks up the chain (manager's manager, etc.) until it reaches the top — no hardcoded department boundaries.
- **Optional Senior Stage**: If an employee has no Senior assigned, the flow skips directly from `Self-Submitted` to `Manager Review`.
- **Department Approval Gate**: If the next reviewer in the chain is a Department Manager, the system routes to a validation-only `dept_approved` step before final approval.
- **Revision Requests**: Any current reviewer or admin can send the evaluation back to the employee with specific notes.
- **Calculated Evaluations**: Aggregate ≥2 periodic reviews for the same employee into a single "master" evaluation using automated best-score averaging (Manager > Senior > Self per criterion).

### Role-Based Access Control
- **Dual-layer authorization**: Coarse `UserRole` enum guards (`admin`, `manager`, `department_manager`, `team_manager`, `senior`, `junior`) plus fine-grained named permissions via custom `Role` entities.
- **Departmental isolation**: Managers see and manage only evaluations within their reporting line.
- **Auto-granted permissions**: `view:team` is automatically granted to any user who manages others.
- **Audit trails**: Append-only logs for both evaluation status transitions (`EvaluationAudit`) and role/permission changes (`PermissionAuditLog`).

### Performance Framework
- **Job-title-based criteria**: Evaluation criteria and weightings (behavioral vs. technical) are assigned per job title — separate from system permissions.
- **Standardized scoring**: 1.0–5.0 scale with automated performance ratings.
- **Evidence-driven**: Multi-stage comments, evidence, and feedback fields per criterion. `expectations` field is optional.
- **Scoring guide**: Each criterion carries a JSON scoring guide mapping score values to descriptive text.

### Performance Ratings
| Rating | Score Range |
|---|---|
| Outstanding | 4.5 – 5.0 |
| Exceeds Expectations | 3.5 – 4.4 |
| Meets Expectations | 2.5 – 3.4 |
| Below Expectations | 1.5 – 2.4 |
| Needs Improvement | 1.0 – 1.4 |

### Administrative Tools
- **Bulk operations**: Bulk delete (soft/hard) for users and evaluations.
- **Dynamic criteria builder**: Criteria management with custom scoring guides and behavioral indicators; name uniqueness enforced per job title.
- **Global branding**: Customize app name and logo (Base64) from the admin panel.
- **Evaluation periods**: Time-boxed cycles with status lifecycle (upcoming / active / inactive) and per-period stats.

### Exports & Reporting
- **PDF export**: Per-evaluation PDF via `@react-pdf/renderer` (client-side, no server round-trip).
- **Excel export**: Bulk evaluation data export via `xlsx`.
- **Reports**: Individual, team, and organization-level analytics views.
- **Analytics dashboard**: Real-time visual trends via Recharts.

### Internationalization
- English and Arabic (RTL) via next-intl. Locale detected from cookie or `Accept-Language` header.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 |
| Backend | Express.js 5 + TypeScript |
| ORM & DB | Prisma ORM + PostgreSQL 16 |
| Auth | JWT (15 min access / 7 day refresh), stored in `localStorage`; auto-refreshed on 401 |
| i18n | next-intl — English & Arabic (RTL) |
| PDF | @react-pdf/renderer |
| Excel | xlsx |
| API Docs | Swagger UI at `/api-docs` |

---

## Project Structure

```
team-evaluation-app/
├── frontend/
│   └── src/
│       ├── app/         # Next.js App Router pages (dashboard, evaluations, reports, admin, team)
│       ├── components/  # UI, evaluation, dashboard, reports components
│       ├── hooks/       # useAuth, useAppSettings
│       ├── lib/         # api.ts (Axios client + typed API namespaces), utils.ts
│       └── types/       # Shared TypeScript types
├── backend/
│   ├── prisma/          # schema.prisma, migrations, seed.ts
│   └── src/
│       ├── index.ts     # Express entry point & route mounts
│       ├── routes/      # One file per domain
│       ├── services/    # Business logic (evaluation.service.ts, auth.service.ts, permission.service.ts)
│       ├── middleware/  # auth, error, i18n
│       ├── config/      # Prisma singleton, Swagger spec
│       └── i18n/        # en.json, ar.json
├── docker-compose.yml
└── evaluation_flow.md   # Detailed evaluation lifecycle documentation
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or use Docker)

### Local Development

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill in DATABASE_URL and JWT secrets
npm install
npx prisma db push
npm run db:seed               # seeds demo users, criteria, and a period
npm run dev                   # starts on :3001

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL
npm install
npm run dev                   # starts on :3000
```

### Docker (all services)

```bash
docker-compose up --build
# DB: localhost:5434 | Backend: localhost:3001 | Frontend: localhost:3000
docker-compose down
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Access token signing key |
| `JWT_REFRESH_SECRET` | — | Refresh token signing key |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `PORT` | `3001` | Server port |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Backend API base URL (client-side) |
| `BACKEND_INTERNAL_URL` | — | Docker-only: internal URL for server-side requests (e.g., `http://backend:3001/api`) |

---

## Demo Access (after seeding)

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@example.com` | `admin123` |
| Manager | `manager@example.com` | `manager123` |
| Junior | `junior@example.com` | `tester123` |

---

## Evaluation Lifecycle

```
draft
  └─► self_submitted
        ├─► senior_submitted   (only if evaluatee.seniorId is set)
        │     └─► manager_submitted ─► [chain up] ─► dept_approved? ─► final_approved
        │
        └─► manager_submitted  (direct, no senior)
              └─► [chain up via currentReviewerId] ─► dept_approved? ─► final_approved

At any post-draft stage:  ─► revision_requested ─► (employee edits) ─► re-submit
Aggregate type:  calculated  (no period, read-only, created via POST /evaluations/calculated)
```

See [`evaluation_flow.md`](./evaluation_flow.md) for the full role-by-role breakdown.

---

## API Reference

Swagger UI: **`http://localhost:3001/api-docs`**

| Domain | Base Path | Notes |
|---|---|---|
| Auth | `/api/auth` | Login, logout, refresh, profile |
| Users | `/api/users` | CRUD, activate/deactivate, bulk ops |
| Evaluations | `/api/evaluations` | Full lifecycle + calculated aggregate |
| Criteria | `/api/criteria` | Evaluation criteria management |
| Periods | `/api/periods` | Evaluation period lifecycle |
| Reports | `/api/reports` | Individual, team, organization |
| Teams | `/api/teams` | Team CRUD + member management |
| Departments | `/api/departments` | Department CRUD |
| Roles | `/api/roles` | Custom roles + permission assignment |
| Levels | `/api/levels` | Levels scoped to roles |
| Permissions | `/api/permissions` | Permission list |
| Job Titles | `/api/job-titles` | Job titles + criteria assignment |
| Settings | `/api/settings` | App name & logo (GET public, PUT admin) |
| Health | `/api/health` | Service health check |

---

## Backend Scripts

```bash
npm run dev          # Dev server (port 3001)
npm run build        # Compile TypeScript to dist/
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Create a new migration file
npm run db:push      # Push schema changes without a migration file
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio GUI
npm run db:reset     # Reset and re-seed database (destructive)
```

---

## License

MIT License.
