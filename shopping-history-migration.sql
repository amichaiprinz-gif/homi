-- Shopping History: snapshots of shopping lists when prepare-order is called
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shopping_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  items JSONB NOT NULL DEFAULT '[]'
);

ALTER TABLE shopping_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can view history" ON shopping_history
  FOR SELECT USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "user can insert history" ON shopping_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can delete own history" ON shopping_history
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS shopping_history_household_id_idx ON shopping_history(household_id);
CREATE INDEX IF NOT EXISTS shopping_history_user_id_idx ON shopping_history(user_id);
CREATE INDEX IF NOT EXISTS shopping_history_created_at_idx ON shopping_history(created_at DESC);
