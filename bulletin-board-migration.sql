-- Bulletin Board: household-level message posts
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bulletin_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bulletin_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can view bulletin" ON bulletin_posts
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can post bulletin" ON bulletin_posts
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "post owner can delete bulletin" ON bulletin_posts
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS bulletin_posts_household_id_idx ON bulletin_posts(household_id);
CREATE INDEX IF NOT EXISTS bulletin_posts_expires_at_idx ON bulletin_posts(expires_at);
