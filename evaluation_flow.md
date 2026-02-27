# Evaluation Flow - EvalPro

This document outlines the end-to-end evaluation lifecycle in the Team Evaluation App.

## 1. Prerequisites
- **Evaluation Period**: An admin or manager must create an active evaluation period (e.g., "Q1 2024").
- **Job Titles & Criteria**: Each job title (e.g., Picker, Supervisor) must have assigned evaluation criteria with weights.
- **User Setup**: Users should be assigned a **Job Title** and a **Manager**. A **Senior** is optional but recommended for Juniors to enable the Peer/Senior review stage.

## 2. The Step-by-Step Flow

### Step A: Initialization (`draft`)
- An evaluation record is created for an employee (Evaluatee) within a specific period.
- **Action**: The Evaluatee logs in and enters their **Self-Evaluation**.
- **Data**: Scores (1-5) for each criterion, evidence, and self-comments.
- **Status**: `draft`

### Step B: Self Submission (`self_submitted`)
- **Action**: The Evaluatee submits their self-evaluation.
- **Guard**: All criteria must be scored before submission.
- **Status**: `self_submitted`

### Step C: Senior Review (`senior_submitted`) - *Optional*
- **Trigger**: Only occurs if a **Senior** is assigned to the Evaluatee (`seniorId` is present).
- **Action**: The assigned Senior reviews the self-evaluation and provides their own scores and feedback.
- **Data**: Senior scores, senior comments, and developmental feedback.
- **Status**: `senior_submitted`
- **Note**: If no Senior is assigned, the flow skips directly from `self_submitted` to the Manager Review stage.

### Step D: Manager Review (`manager_submitted`)
- **Action**: The **Team Manager** (or designated Evaluator) reviews the scores. If Step C was skipped, they review only the self-evaluation.
- **Data**: Manager scores, final comments, and manager feedback.
- **Status**: `manager_submitted`
- **Result**: The system calculates the final `overallScore` and assigns a `performanceRating` (e.g., Meets Expectations, Outstanding).

### Step E: Department Approval (`dept_approved`)
- **Action**: The **Department Manager** reviews the entire evaluation and provides final approval.
- **Data**: Approval notes.
- **Status**: `dept_approved`
- **Note**: This is the final step in the standard workflow.

### Step F: Archival/Finalization (`final_approved`)
- **Status**: `final_approved`
- **Usage**: Used for historic records or when an admin manually marks the process as fully concluded beyond department approval.

---

## 3. Revisions & Corrections
At any point after self-submission (Stages C, D, or E), a superior (Senior, Manager, or Admin) can trigger a **Revision Requested**:
- **Action**: Use the "Request Revision" action with notes explaining what needs to be changed.
- **Status**: `revision_requested` (Moves back to a state where the Evaluatee or previous reviewer can edit).

## 4. Scoring Logic
- **Scale**: 1.0 to 5.0.
- **Overall Score**: The arithmetic mean of all criteria scores for the *latest* submitted stage (e.g., if Manager has scored, the overall score reflects the Manager's view).
- **Stages**:
    - `self`: Employee's view.
    - `senior`: Peer/Senior's view.
    - `manager`: Official performance record.

## 5. Roles & Permissions Summary
| Role | Can Create | Can Score Self | Can Score Others | Can Approve |
| :--- | :---: | :---: | :---: | :---: |
| **Junior** | Yes (Self) | Yes | No | No |
| **Senior** | Yes (Self) | Yes | Yes (as assigned Senior) | No |
| **Team Manager** | Yes | Yes | Yes (their team) | No |
| **Dept Manager**| Yes | Yes | Yes (their dept) | Yes |
| **Admin** | Yes | Yes | Yes (all) | Yes |

---

## 6. Aggregate (Calculated) Evaluations
Separate from the standard period flow, admins or authorized managers can create **Calculated Evaluations**.
- **Purpose**: To combine multiple evaluations (e.g., from different projects or shorter periods) into a single summary.
- **Logic**: 
    1. System picks the "best available" score for each criterion in the source evaluations (Manager > Senior > Self).
    2. Averages these scores across all selected sources.
    3. Creates a new evaluation record with `status: calculated`.
- **Note**: These do not have an `evaluationPeriodId` and cannot be edited once generated.

---
*Note: The system maintains a full **Audit Log** for every status change, record creation, and revision request.*
