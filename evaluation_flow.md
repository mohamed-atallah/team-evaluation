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
- **Reporting Routing**: The system identifies the next reviewer (Senior if assigned, else Team Manager).
- **Direct-to-Dept Skip**: If no Senior is assigned and the direct manager is a **Department Manager**, the status may skip directly to `dept_approved` for final validation.
- **Status**: `self_submitted` (or `dept_approved` if skipping).

### Step C: Senior Review (`senior_submitted`) - *Optional*
- **Trigger**: Occurs if a **Senior** is assigned.
- **Action**: Senior provides scores and feedback.
- **Reporting Routing**: Upon submission, the evaluation is forwarded to the Evaluatee's direct Manager.
- **Direct-to-Dept Skip**: If the Evaluatee's Manager is a **Department Manager**, the status skips the next scoring stage and moves to `dept_approved`.
- **Status**: `senior_submitted` (or `dept_approved` if skipping).
- **Note**: If no Senior is assigned, the flow skips directly from `self_submitted` to the Manager Review stage (unless a direct-to-dept skip occurs).

### Step D: Manager Review (`manager_submitted`)
- **Action**: The **Current Reviewer** (initially the direct Team Manager) reviews and scores the evaluation.
- **Reporting Chain Progression**: When a manager submits their review, the system automatically identifies their manager (the next link in the reporting chain).
- **Branching Logic**:
    - **Scoring Continue**: If the *next* reviewer is a standard Manager, the status remains `manager_submitted` and the evaluation is forwarded for another round of scoring. *Note: Each manager in the chain overwrites the 'manager' stage scores with their own definitive values.*
    - **Skip to Approval**: If the *next* reviewer is a **Department Manager**, the system skips further scoring and moves the status directly to `dept_approved` (Forwarded for Approval).
    - **Finalization**: If no superior is found (top of the chain), the status becomes `final_approved`.

### Step E: Department Approval (`dept_approved`)
- **Action**: This is an **Approve-only stage** triggered when the reporting chain reaches a Department Manager.
- **Behavior**: Instead of re-scoring the criteria, the Department Manager reviews the existing manager/senior scores and provide their **Final Approval Notes**.
- **Role**: Effectively acts as a validation gate for the entire department's results.

### Step F: Finalization (`final_approved`)
- **Status**: `final_approved`
- **Definition**: The terminal state of the evaluation. Reached either after Department Approval or when the reporting chain is exhausted.

---

## 3. Revisions & Corrections
At any point after self-submission, an authorized reviewer (current reviewer, superior, or admin) can trigger a **Revision Requested**:
- **Action**: Use the "Request Revision" action with notes explaining the requirement.
- **Status**: `revision_requested` (Moves back to a state where the Evaluatee can edit).
- **Note**: The system now explicitly allows the **Current Active Reviewer** in the chain to request revisions.

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
