-- Rami Levy session storage
-- Stores session cookies per household so the app can add items to RL cart.
-- All access via admin client (service role) only — no user-facing RLS policies.
-- This keeps session cookies inaccessible to authenticated users directly.

CREATE TABLE IF NOT EXISTS rl_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  rl_email text NOT NULL,
  session_cookie text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rl_sessions ENABLE ROW LEVEL SECURITY;
-- No user-facing RLS policies — all writes/reads go through service role (admin client).
-- Authenticated users cannot query this table directly.
