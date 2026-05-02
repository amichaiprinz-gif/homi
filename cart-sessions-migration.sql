-- Cart Sessions + Product Memory for Rami Levy Cart Builder
-- Run this in Supabase SQL Editor

-- ── Cart Sessions ─────────────────────────────────────────────────────────────
-- Stores each cart build result so user can review and revisit
CREATE TABLE IF NOT EXISTS cart_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready',        -- ready | partial | failed
  items JSONB NOT NULL DEFAULT '[]',           -- CartItem[]
  matched_count INT NOT NULL DEFAULT 0,
  substituted_count INT NOT NULL DEFAULT 0,
  not_found_count INT NOT NULL DEFAULT 0,
  estimated_total DECIMAL(10,2),
  build_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cart_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage cart sessions" ON cart_sessions
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS cart_sessions_household_idx ON cart_sessions(household_id);
CREATE INDEX IF NOT EXISTS cart_sessions_user_idx ON cart_sessions(user_id);
CREATE INDEX IF NOT EXISTS cart_sessions_created_at_idx ON cart_sessions(created_at DESC);

-- ── Product Memory ────────────────────────────────────────────────────────────
-- Household-specific memory: maps normalized item terms to known RL products.
-- Repeated cart builds skip search for remembered items (faster + consistent).
CREATE TABLE IF NOT EXISTS rl_product_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  item_key TEXT NOT NULL,                      -- normalized item text (e.g. "חלב")
  rl_product_id INT NOT NULL,                  -- Rami Levy product numeric ID
  rl_product_name TEXT NOT NULL,
  rl_product_url TEXT NOT NULL,
  rl_product_image TEXT,
  rl_product_price DECIMAL(10,2),
  rl_product_brand TEXT,
  rl_product_content TEXT,
  confidence TEXT NOT NULL DEFAULT 'auto',     -- auto | confirmed
  use_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rl_product_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage product memory" ON rl_product_memory
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS rl_product_memory_key_idx ON rl_product_memory(household_id, item_key);
CREATE INDEX IF NOT EXISTS rl_product_memory_household_idx ON rl_product_memory(household_id);
