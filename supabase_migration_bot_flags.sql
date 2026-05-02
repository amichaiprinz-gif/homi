-- Run in Supabase SQL Editor
-- Simple key/value flags table for bot triggers

CREATE TABLE IF NOT EXISTS bot_flags (
  key          text        NOT NULL,
  household_id uuid        NOT NULL,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (key, household_id)
);

ALTER TABLE bot_flags ENABLE ROW LEVEL SECURITY;
