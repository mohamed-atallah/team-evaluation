# Team Evaluation Web Application

A comprehensive web application for evaluating software testers across three experience levels (Junior, Mid-Level, Senior) using standardized criteria, calculating performance scores, and generating exportable reports.

## Features

- **Multi-level Evaluation Criteria**: Pre-loaded criteria for Junior, Mid-Level, and Senior testers
- **Self & Manager Assessments**: Two-way evaluation system
- **Automated Score Calculation**: 1-5 scoring scale with automatic performance rating
- **PDF & Excel Reports**: Export evaluation reports in multiple formats
- **Dashboard Analytics**: Visual representation of team performance
- **Development Plans**: Create and track improvement plans

## Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Recharts
- **Backend**: Node.js, Express.js, Prisma ORM
- **Database**: PostgreSQL
- **Authentication**: JWT with refresh tokens

## Project Structure

```
team-evaluation-app/
├── frontend/          # Next.js frontend application
│   ├── src/
│   │   ├── app/       # App router pages
│   │   ├── components/ # Reusable components
│   │   ├── hooks/     # Custom hooks
│   │   ├── lib/       # Utilities and API client
│   │   └── types/     # TypeScript types
│   └── ...
├── backend/           # Express.js backend API
│   ├── src/
│   │   ├── routes/    # API routes
│   │   ├── services/  # Business logic
│   │   ├── middleware/ # Auth & error handling
│   │   └── config/    # Configuration
│   ├── prisma/        # Database schema & migrations
│   └── ...
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Getting Started

### 1. Clone and Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb team_evaluation

# Update .env with your database URL
# backend/.env
DATABASE_URL="postgresql://username:password@localhost:5432/team_evaluation"

# Generate Prisma client and push schema
cd backend
npx prisma generate
npx prisma db push

# Seed the database with evaluation criteria and demo users
npm run db:seed
```

### 3. Start the Application

```bash
# Terminal 1 - Backend (runs on port 3001)
cd backend
npm run dev

# Terminal 2 - Frontend (runs on port 3000)
cd frontend
npm run dev
```

### 4. Access the Application

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo Accounts

After seeding, you can log in with these accounts:

| Role    | Email               | Password   |
|---------|---------------------|------------|
| Admin   | admin@example.com   | admin123   |
| Manager | manager@example.com | manager123 |
| Tester  | junior@example.com  | tester123  |

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Evaluations
- `GET /api/evaluations` - List evaluations
- `POST /api/evaluations` - Create evaluation
- `GET /api/evaluations/:id` - Get evaluation details
- `POST /api/evaluations/:id/scores` - Save scores
- `POST /api/evaluations/:id/submit` - Submit evaluation

### Reports
- `GET /api/reports/individual/:userId` - Individual report
- `GET /api/reports/team/:teamId` - Team report
- `GET /api/reports/organization` - Organization report

## Evaluation Criteria

### Junior Tester (6 criteria)
1. Bug Reporting
2. Test Case Design
3. Technical Skills
4. Communication
5. Problem-Solving
6. Learning & Growth

### Mid-Level Tester (7 criteria)
1. Bug Reporting
2. Test Coverage
3. Technical Skills
4. Project Understanding
5. Communication
6. Process Improvement
7. Problem-Solving

### Senior Tester (7 criteria)
1. Bug Reporting
2. Test Strategy
3. Technical Leadership
4. Strategic Understanding
5. Mentoring & Leadership
6. Cross-Functional Collaboration
7. Risk Identification

## Scoring Scale

| Score | Rating                       |
|-------|------------------------------|
| 4.5-5.0 | Outstanding                |
| 3.5-4.4 | Exceeds Expectations       |
| 2.5-3.4 | Meets Expectations         |
| 1.5-2.4 | Below Expectations         |
| 1.0-1.4 | Needs Significant Improvement |

## License

MIT

## Docker

docker-compose down && docker-compose up --build