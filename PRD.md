# Product Requirements Document (PRD): EvalPro (Team Evaluation App)

## 1. Product Overview
**EvalPro** is a comprehensive performance management platform designed to streamline the evaluation process for software testing teams. It enables structured, multi-level assessments based on standardized criteria, helping organizations identify talent, track growth, and generate data-driven performance reports.

The system replaces manual, ad-hoc evaluations with a digital workflow that integrates self-assessments, peer/senior reviews, and manager approvals into a single source of truth.

---

## 2. User Roles & Permissions
The system uses a hierarchical role-based access control (RBAC) model:

| Role | Description | Key Capabilities |
| :--- | :--- | :--- |
| **Junior / Tester** | Individual contributor | Submit self-evaluations, view own reports, manage own profile. |
| **Senior** | Senior contributor / Peer mentor | Same as Junior + perform peer/senior reviews for assigned mentees. |
| **Team Manager** | Direct supervisor | Manage team members, perform manager reviews, create evaluations for team. |
| **Dept Manager** | Department head | View department-wide analytics, final validation/approval for evaluations. |
| **Admin** | System administrator | Manage all users, job titles, criteria, periods, and global app settings. |

---

## 3. Core Features

### 3.1. Authentication & Security
- **Secure Login**: JWT-based authentication with high-security password hashing.
- **Session Management**: Access and Refresh token lifecycle management.
- **Profile Management**: Users can update their personal information and avatars.
- **Password Visibility**: Toggle to show/hide passwords during login.

### 3.2. Evaluation Framework
- **Job Title Mapping**: Link specific criteria and weights to job titles (e.g., Picker, Supervisor, Tester).
- **Competency Matrix**: Define granular criteria with titles, descriptions, expectations, and behavioral indicators.
- **Scoring Scale**: A standardized 1.0 to 5.0 scale with mapped performance ratings:
  - 4.5 - 5.0: Outstanding
  - 3.5 - 4.4: Exceeds Expectations
  - 2.5 - 3.4: Meets Expectations
  - 1.5 - 2.4: Below Expectations
  - 1.0 - 1.4: Needs Significant Improvement

### 3.3. Evaluation Lifecycle (Workflows)
The system supports a state-machine driven evaluation process:
1.  **Draft**: Employee fills out their self-assessment.
2.  **Self-Submitted**: Locked for employee; moved to the next reviewer (Senior OR Manager).
3.  **Senior Review (Optional)**: Peer/mentor provides secondary perspective.
4.  **Manager Review**: The definitive performance assessment.
5.  **Department Approval**: A validation gate for consistency across the department.
6.  **Finalized**: Terminal state; report generated and locked.
7.  **Revision Requested**: At any stage, a reviewer can send the evaluation back to the employee for corrections.

### 3.4. Reporting & Exports
- **Individual Performance Reports**: Detailed PDF exports showing scores across all stages (Self vs. Manager) and specific feedback.
- **Team Analytics**: Dashboard visualizations (Recharts) for team-wide performance trends.
- **Bulk Exports**: Ability to export evaluation data in Excel format for HR processing.
- **Calculated Evaluations**: Feature to aggregate multiple periodic evaluations into a single "Master" evaluation.

### 3.5. Administrative Tools
- **User Management**: Bulk actions for deleting, activating, or modifying user roles.
- **Job Title & Criteria Builder**: Interface to drag-and-drop criteria, adjust weights (Behavior vs. Results), and manage hierarchies.
- **Evaluation Periods**: Create and manage "Windows" for evaluations (e.g., Q1 2024).
- **Global Settings**: Customize application name and branding logo (supporting base64 uploads).
- **Audit Logs**: Full traceability of every status change and record modification.

---

## 4. Technical Requirements

### 4.1. Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Recharts.
- **Backend**: Node.js, Express.js, Prisma ORM.
- **Database**: PostgreSQL (hosted via Docker or Cloud).
- **Reporting**: PDF generation utilities, Excel export libraries.

### 4.2. Performance & Scalability
- **Large Payload Support**: Backend configured to handle large image uploads (base64 logos).
- **Efficient Data Fetching**: Optimized Prisma queries for complex organizational hierarchies.

---

## 5. Future Roadmap (Proposed)
- **Automatic Reminder Notifications**: Email alerts for pending evaluations.
- **AI-Powered Insights**: Automated summary generation based on manager comments.
- **Development Plan Integration**: Link evaluation gaps directly to personalized training modules.
- **Multi-tenant Support**: Capability to host multiple organizations on a single instance.
- **Mobile Application**: Dedicated app for mobile-first evaluation entries.
