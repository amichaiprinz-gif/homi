-- Bot memory table — household facts that Bob reads and writes
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bot_memory (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL,
  key          text        NOT NULL,
  value        text        NOT NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (household_id, key)
);

ALTER TABLE bot_memory ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS needed — accessed only via admin/service-role client from bot routes
