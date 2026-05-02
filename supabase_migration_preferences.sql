-- Run this in Supabase SQL Editor
-- Creates the table that stores per-household product match preferences
-- (used by the AI matching system to learn which products the user prefers)

CREATE TABLE IF NOT EXISTS rl_product_preferences (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id  uuid        NOT NULL,
  item_text     text        NOT NULL,
  rl_product_id integer     NOT NULL,
  rl_product_name text,
  feedback      text        NOT NULL CHECK (feedback IN ('good', 'bad')),
  updated_at    timestamptz DEFAULT now()
);

-- Unique per household + item + product so we can UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS rl_product_pref_unique
  ON rl_product_preferences (household_id, item_text, rl_product_id);

-- Service role bypasses RLS — no need for user-level policies here
ALTER TABLE rl_product_preferences ENABLE ROW LEVEL SECURITY;
