-- Migration: Convert from level-based criteria to role-based criteria
-- Date: 2026-01-23
-- Description: This migration adds the role_criteria junction table and removes
--              the level_id foreign key from evaluation_criteria

-- Step 1: Create the new role_criteria junction table
CREATE TABLE IF NOT EXISTS "role_criteria" (
    "role_id" TEXT NOT NULL,
    "criteria_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(3,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_criteria_pkey" PRIMARY KEY ("role_id","criteria_id")
);

-- Step 2: Add foreign key constraints
ALTER TABLE "role_criteria" ADD CONSTRAINT "role_criteria_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_criteria" ADD CONSTRAINT "role_criteria_criteria_id_fkey"
    FOREIGN KEY ("criteria_id") REFERENCES "evaluation_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Migrate existing data - Link criteria to roles based on their levels
-- This assumes that users with a roleId should have their role's criteria
-- We'll link each criterion to the role of the level it was associated with
INSERT INTO "role_criteria" ("role_id", "criteria_id", "display_order", "weight", "created_at", "updated_at")
SELECT DISTINCT
    l."role_id",
    ec."id" as "criteria_id",
    ec."display_order",
    ec."weight",
    NOW(),
    NOW()
FROM "evaluation_criteria" ec
INNER JOIN "levels" l ON ec."level_id" = l."id"
WHERE ec."level_id" IS NOT NULL
ON CONFLICT ("role_id", "criteria_id") DO NOTHING;

-- Step 4: Drop the unique constraint on (level_id, name) from evaluation_criteria
ALTER TABLE "evaluation_criteria" DROP CONSTRAINT IF EXISTS "evaluation_criteria_level_id_name_key";

-- Step 5: Add unique constraint on name only
-- First, we need to handle potential duplicates by making names unique
-- Append level name to duplicate criteria names to make them unique
WITH duplicates AS (
    SELECT name, COUNT(*) as cnt
    FROM "evaluation_criteria"
    WHERE "level_id" IS NOT NULL
    GROUP BY name
    HAVING COUNT(*) > 1
)
UPDATE "evaluation_criteria" ec
SET name = ec.name || ' (' || l.name || ')'
FROM "levels" l, duplicates d
WHERE ec."level_id" = l.id
    AND ec.name = d.name
    AND d.cnt > 1;

-- Now add the unique constraint
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_name_key" UNIQUE ("name");

-- Step 6: Remove the level_id foreign key constraint
ALTER TABLE "evaluation_criteria" DROP CONSTRAINT IF EXISTS "evaluation_criteria_level_id_fkey";

-- Step 7: Drop the level_id column (optional - can be done after verification)
-- Uncomment the following line after verifying the migration works:
-- ALTER TABLE "evaluation_criteria" DROP COLUMN IF EXISTS "level_id";

-- Step 8: Create indexes for better performance
CREATE INDEX IF NOT EXISTS "role_criteria_role_id_idx" ON "role_criteria"("role_id");
CREATE INDEX IF NOT EXISTS "role_criteria_criteria_id_idx" ON "role_criteria"("criteria_id");

-- Verification queries (run these to verify the migration):
-- SELECT COUNT(*) FROM role_criteria; -- Should show migrated relationships
-- SELECT * FROM evaluation_criteria WHERE level_id IS NOT NULL; -- Should show old data if column still exists
-- SELECT r.name as role, COUNT(rc.criteria_id) as criteria_count
-- FROM roles r
-- LEFT JOIN role_criteria rc ON r.id = rc.role_id
-- GROUP BY r.id, r.name; -- Should show criteria count per role
