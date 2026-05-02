-- Push notification subscriptions
create table if not exists push_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription jsonb not null,
  updated_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "Users manage own push subscription"
  on push_subscriptions for all using (user_id = auth.uid());

-- Enable realtime for tasks table
-- (Run this in Supabase Dashboard > Database > Replication > Tables, or via SQL:)
alter publication supabase_realtime add table tasks;
