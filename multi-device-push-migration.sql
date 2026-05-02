-- ============================================================
-- Multi-device push subscriptions migration
-- Run this in your Supabase SQL Editor (or via supabase CLI).
--
-- BEFORE running this, deploy the new code first — the new
-- subscribe route has a graceful fallback for pre-migration state.
-- AFTER running this, each user can register multiple devices.
-- ============================================================

-- Step 1: Add endpoint column and backfill from existing subscription JSON
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint TEXT;

UPDATE push_subscriptions
SET endpoint = subscription->>'endpoint'
WHERE endpoint IS NULL;

ALTER TABLE push_subscriptions
  ALTER COLUMN endpoint SET NOT NULL;

-- Step 2: Change primary key from user_id to a new UUID id column
ALTER TABLE push_subscriptions
  DROP CONSTRAINT push_subscriptions_pkey;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Backfill id for rows that existed before (shouldn't be any, but just in case)
UPDATE push_subscriptions
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE push_subscriptions
  ADD PRIMARY KEY (id);

-- Step 3: Unique constraint on (user_id, endpoint) — one row per device per user
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_key
    UNIQUE (user_id, endpoint);

-- Step 4: Index for fast lookups by user_id (still the primary query pattern)
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);

-- ============================================================
-- RLS note: existing RLS policies on push_subscriptions that
-- use "user_id = auth.uid()" continue to work unchanged.
-- The new PK (id) is not referenced by any RLS policy.
-- ============================================================
