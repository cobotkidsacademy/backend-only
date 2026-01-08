-- Create parents table to support parent login and dashboard
create table if not exists parents (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional: link parents to students (many-to-many) if not already modeled elsewhere
create table if not exists parent_student_links (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references parents(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);






