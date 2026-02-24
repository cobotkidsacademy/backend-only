-- Simple parent–admin chat (thread with admin@example.com).
-- No encryption; for support/contact use.

create table if not exists parent_admin_messages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  sender_type text not null check (sender_type in ('parent', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_parent_admin_messages_parent_id
  on parent_admin_messages(parent_id);
create index if not exists idx_parent_admin_messages_created_at
  on parent_admin_messages(created_at desc);

comment on table parent_admin_messages is 'Chat between parent and admin (admin@example.com)';
