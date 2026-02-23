-- Migration: Implement Job Title based evaluation criteria
-- Date: 2026-01-23
-- Description: Creates JobTitle table and JobTitleCriteria junction table
--              Separates Roles (permissions) from Job Titles (evaluation)

-- Step 1: Create the job_titles table
CREATE TABLE IF NOT EXISTS "job_titles" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "department_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_titles_department_id_fkey"
        FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Step 2: Create the job_title_criteria junction table
CREATE TABLE IF NOT EXISTS "job_title_criteria" (
    "job_title_id" TEXT NOT NULL,
    "criteria_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(3,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_title_criteria_pkey" PRIMARY KEY ("job_title_id", "criteria_id"),
    CONSTRAINT "job_title_criteria_job_title_id_fkey"
        FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_title_criteria_criteria_id_fkey"
        FOREIGN KEY ("criteria_id") REFERENCES "evaluation_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 3: Add job_title_id column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title_id" TEXT;

-- Step 4: Add foreign key constraint for job_title_id
ALTER TABLE "users" ADD CONSTRAINT "users_job_title_id_fkey"
    FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Create indexes for better performance
CREATE INDEX IF NOT EXISTS "job_titles_department_id_idx" ON "job_titles"("department_id");
CREATE INDEX IF NOT EXISTS "job_titles_is_active_idx" ON "job_titles"("is_active");
CREATE INDEX IF NOT EXISTS "job_title_criteria_job_title_id_idx" ON "job_title_criteria"("job_title_id");
CREATE INDEX IF NOT EXISTS "job_title_criteria_criteria_id_idx" ON "job_title_criteria"("criteria_id");
CREATE INDEX IF NOT EXISTS "users_job_title_id_idx" ON "users"("job_title_id");

-- Step 6: Migrate existing data from role_criteria to job_title_criteria (if exists)
-- This assumes you want to create job titles based on existing roles
-- Skip this step if you want to start fresh with new job titles

-- First, create job titles based on existing roles (if role_criteria exists)
DO $$
BEGIN
    -- Check if role_criteria table exists and has data
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_criteria') THEN
        -- Create job titles from roles that have criteria assigned
        INSERT INTO "job_titles" ("id", "name", "description", "created_at", "updated_at")
        SELECT DISTINCT
            r.id,
            r.name,
            r.description,
            NOW(),
            NOW()
        FROM "roles" r
        INNER JOIN "role_criteria" rc ON r.id = rc.role_id
        ON CONFLICT ("name") DO NOTHING;

        -- Migrate role_criteria to job_title_criteria
        INSERT INTO "job_title_criteria" ("job_title_id", "criteria_id", "display_order", "weight", "created_at", "updated_at")
        SELECT
            rc.role_id as job_title_id,
            rc.criteria_id,
            rc.display_order,
            rc.weight,
            NOW(),
            NOW()
        FROM "role_criteria" rc
        WHERE EXISTS (SELECT 1 FROM "job_titles" jt WHERE jt.id = rc.role_id)
        ON CONFLICT ("job_title_id", "criteria_id") DO NOTHING;

        -- Update users' job_title_id based on their role_id (if they had criteria via role)
        UPDATE "users" u
        SET "job_title_id" = u.role_id
        WHERE EXISTS (SELECT 1 FROM "job_titles" jt WHERE jt.id = u.role_id);
    END IF;
END $$;

-- Step 7: (Optional) Drop the old role_criteria table after verification
-- Uncomment the following line after verifying the migration:
-- DROP TABLE IF EXISTS "role_criteria";

-- Verification queries (run these to verify the migration):
-- SELECT COUNT(*) FROM job_titles;
-- SELECT COUNT(*) FROM job_title_criteria;
-- SELECT jt.name as job_title, COUNT(jtc.criteria_id) as criteria_count
-- FROM job_titles jt
-- LEFT JOIN job_title_criteria jtc ON jt.id = jtc.job_title_id
-- GROUP BY jt.id, jt.name;
-- SELECT COUNT(*) FROM users WHERE job_title_id IS NOT NULL;
