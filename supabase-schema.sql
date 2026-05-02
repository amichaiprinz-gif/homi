-- HomeBase Database Schema
-- הרץ את זה ב-Supabase SQL Editor
-- SAFE TO RE-RUN: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- Households table
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'הבית שלנו',
  invite_code text unique not null,
  created_at timestamptz default now()
);

-- Household members
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now(),
  unique(household_id, user_id)
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'other',
  icon text not null default '📋',
  frequency_value integer not null default 7,
  frequency_unit text not null default 'days' check (frequency_unit in ('hours', 'days', 'weeks', 'months')),
  last_done_at timestamptz,
  next_due_at timestamptz,
  assigned_to uuid references auth.users(id),
  is_roborock boolean default false,
  is_quick boolean default false,
  points integer default 1,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- Task logs (history)
create table task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  done_by uuid references auth.users(id) not null,
  done_at timestamptz default now(),
  note text
);

-- Row Level Security
alter table households enable row level security;
alter table household_members enable row level security;
alter table tasks enable row level security;
alter table task_logs enable row level security;

-- Policies: members can see their household
create policy "Members can view their household"
  on households for select
  using (
    id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Members can create households"
  on households for insert
  with check (true);

create policy "Members can view their membership"
  on household_members for select
  using (user_id = auth.uid() or household_id in (
    select household_id from household_members where user_id = auth.uid()
  ));

create policy "Users can join households"
  on household_members for insert
  with check (user_id = auth.uid());

create policy "Users can update their membership"
  on household_members for update
  using (user_id = auth.uid());

create policy "Members can view tasks"
  on tasks for select
  using (
    created_by = auth.uid() or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Members can insert tasks"
  on tasks for insert
  with check (created_by = auth.uid());

create policy "Members can update tasks"
  on tasks for update
  using (
    created_by = auth.uid() or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Members can delete their tasks"
  on tasks for delete
  using (created_by = auth.uid());

create policy "Members can view logs"
  on task_logs for select
  using (
    done_by = auth.uid() or
    task_id in (
      select id from tasks where household_id in (
        select household_id from household_members where user_id = auth.uid()
      )
    )
  );

create policy "Members can insert logs"
  on task_logs for insert
  with check (done_by = auth.uid());

-- ============================================================
-- Push subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users manage own push subscriptions') THEN
    CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Separate send-time tracking from subscription registration.
-- updated_at = when the subscription token was saved/refreshed (set by subscribe route).
-- last_sent_at = when a push notification was last successfully delivered (set by send routes).
-- Rate limiting uses last_sent_at ONLY. A NULL last_sent_at means "never notified" — not throttled.
-- This fixes the bug where registering a subscription suppressed the first reminder for up to 1 hour.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ NULL;
-- created_at for observability (when was this subscription first registered)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- Task scheduling enhancements
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'recurring'
  CHECK (schedule_type IN ('recurring', 'weekly', 'one_time'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_days integer[] DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_time text DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_before_hours integer DEFAULT 1;

-- ============================================================
-- Roborock tokens (run in Supabase SQL editor)
-- If table already exists, run only the ALTER TABLE block
CREATE TABLE IF NOT EXISTS roborock_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT,
  rruid TEXT,
  rriot_user TEXT,
  rriot_secret TEXT,
  rriot_h TEXT,
  rriot_k TEXT,
  api_url TEXT,
  mqtt_url TEXT,
  login_url TEXT,
  client_id TEXT,
  pending_k TEXT,
  pending_s TEXT,
  home_id TEXT,
  device_duid TEXT,
  device_local_key TEXT,
  device_pv TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roborock_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "roborock_tokens_owner" ON roborock_tokens
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- If table already exists, add missing columns:
ALTER TABLE roborock_tokens
  ADD COLUMN IF NOT EXISTS rriot_k TEXT,
  ADD COLUMN IF NOT EXISTS mqtt_url TEXT,
  ADD COLUMN IF NOT EXISTS home_id TEXT,
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_k TEXT,
  ADD COLUMN IF NOT EXISTS pending_s TEXT,
  ADD COLUMN IF NOT EXISTS device_local_key TEXT,
  ADD COLUMN IF NOT EXISTS device_pv TEXT;

-- ============================================================
-- Recipes
-- ============================================================
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  household_id uuid references households(id) on delete cascade,
  title text not null,
  category text not null default 'other',
  servings integer,
  prep_time integer,
  instructions text,
  created_at timestamptz default now()
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade not null,
  name text not null,
  quantity text,
  unit text,
  sort_order integer default 0
);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

create policy "Users can manage their own recipes"
  on recipes for all
  using (
    user_id = auth.uid() or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  )
  with check (user_id = auth.uid());

create policy "Users can manage recipe ingredients"
  on recipe_ingredients for all
  using (
    recipe_id in (
      select id from recipes where
        user_id = auth.uid() or
        household_id in (
          select household_id from household_members where user_id = auth.uid()
        )
    )
  )
  with check (
    recipe_id in (select id from recipes where user_id = auth.uid())
  );

-- ============================================================
-- Shopping list
-- ============================================================
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  household_id uuid references households(id) on delete cascade,
  text text not null,
  quantity text,
  note text,
  done boolean default false,
  category text default null,
  created_at timestamptz default now()
);

-- Add category column to existing tables (safe to re-run)
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

-- Enable Realtime for shopping_items (run in Supabase SQL editor)
-- If this fails with "already exists", ignore the error.
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_items;

-- ============================================================
-- Shopping mode flag on household (global supermarket mode)
-- ============================================================
ALTER TABLE households ADD COLUMN IF NOT EXISTS shopping_active boolean DEFAULT false;

-- Allow any household member to update the shopping_active flag
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'households' AND policyname = 'Members can update their household') THEN
    CREATE POLICY "Members can update their household"
      ON households FOR UPDATE
      USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()))
      WITH CHECK (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Enable Realtime for households (run in Supabase SQL editor)
ALTER PUBLICATION supabase_realtime ADD TABLE households;

alter table shopping_items enable row level security;

create policy "Users can manage shopping items"
  on shopping_items for all
  using (
    user_id = auth.uid() or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  )
  with check (user_id = auth.uid());

-- ============================================================
-- Budget
-- ============================================================
create table if not exists budget_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text default '💰',
  monthly_limit numeric,
  created_at timestamptz default now()
);

create table if not exists budget_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  household_id uuid references households(id) on delete cascade,
  category_id uuid references budget_categories(id) on delete set null,
  amount numeric not null,
  description text not null,
  expense_date date not null default current_date,
  created_at timestamptz default now()
);

alter table budget_categories enable row level security;
alter table budget_expenses enable row level security;

create policy "Users can manage budget categories"
  on budget_categories for all
  using (
    household_id is null or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  )
  with check (true);

create policy "Users can manage budget expenses"
  on budget_expenses for all
  using (
    user_id = auth.uid() or
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  )
  with check (user_id = auth.uid());
