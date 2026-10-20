-- Mezzanine Design Tool: initial schema.
-- Users, projects (inputs + latest results), project sharing, calculation history, audit log, login throttling.

create table users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  name                 text not null,
  password_hash        text not null,                       -- scrypt$N$r$p$salt$hash (salted; never the password)
  role                 text not null default 'user' check (role in ('admin', 'user')),
  active               boolean not null default true,       -- disabled users cannot log in; existing sessions stop working
  token_version        integer not null default 0,          -- bumped on password reset / disable: invalidates all sessions
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  last_login_at        timestamptz
);
create unique index users_email_lower_uq on users (lower(email));

create table projects (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references users (id) on delete restrict,
  name                 text not null check (length(name) between 1 and 200),
  reference            text not null default '' check (length(reference) <= 200),
  customer             text not null default '' check (length(customer) <= 200),
  customer_contact     text not null default '' check (length(customer_contact) <= 300),
  site                 text not null default '' check (length(site) <= 300),
  notes                text not null default '' check (length(notes) <= 4000),

  -- every user-entered value (validated against the input schema on the server); engine reference data stays in the server code
  inputs               jsonb not null,
  revision             integer not null default 1,          -- +1 on every save; also the optimistic-concurrency token and the report revision

  -- latest calculation (recomputed on the server at every save)
  design_status        text check (design_status in ('PASS', 'FAIL', 'REVIEW', 'INVALID')),
  max_utilisation      double precision,
  n_fail               integer,
  n_review             integer,
  results              jsonb,                               -- compact: module statuses, every check's demand / resistance / utilisation / status, warnings
  calculated_at        timestamptz,
  engine_version       text,
  input_fingerprint    text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index projects_owner_idx on projects (owner_id, updated_at desc);

-- authorised users other than the owner
create table project_members (
  project_id           uuid not null references projects (id) on delete cascade,
  user_id              uuid not null references users (id) on delete cascade,
  role                 text not null check (role in ('viewer', 'editor')),
  added_by             uuid references users (id) on delete set null,
  created_at           timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

-- one row per saved calculation (history; the project row holds the latest)
create table calculations (
  id                   bigserial primary key,
  project_id           uuid not null references projects (id) on delete cascade,
  user_id              uuid references users (id) on delete set null,
  revision             integer not null,
  engine_version       text not null,
  input_fingerprint    text not null,
  design_status        text not null,
  max_utilisation      double precision,
  n_fail               integer,
  n_review             integer,
  created_at           timestamptz not null default now()
);
create index calculations_project_idx on calculations (project_id, created_at desc);

create table audit_log (
  id                   bigserial primary key,
  at                   timestamptz not null default now(),
  user_id              uuid references users (id) on delete set null,
  action               text not null,                       -- login, logout, project.create, project.update, project.delete, report.pdf, admin.user.create ...
  project_id           uuid,                                -- no FK: keeps the record after a project is deleted
  ip                   text,
  detail               jsonb
);
create index audit_log_at_idx on audit_log (at desc);

-- failed / successful login attempts (rate limiting must work across serverless instances, hence the database)
create table login_attempts (
  id                   bigserial primary key,
  at                   timestamptz not null default now(),
  email                text not null,
  ip                   text not null,
  success              boolean not null
);
create index login_attempts_email_idx on login_attempts (lower(email), at desc);
create index login_attempts_ip_idx on login_attempts (ip, at desc);
