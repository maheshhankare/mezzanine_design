-- Frame analysis and IS 800 design projects: the model, the settings, and one row per analysis / design run.
-- A run belongs to one model revision (identified by a fingerprint); when the model changes, earlier runs stay and are shown as belonging to an earlier revision.

create table frame_projects (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references users (id) on delete restrict,
  name                 text not null check (length(name) between 1 and 200),
  data                 jsonb not null,                       -- FrameProjectData: frame model, design sections, load cases, combinations, settings
  revision             integer not null default 1,          -- +1 on every save: the optimistic-concurrency token
  model_fingerprint    text not null,                       -- changes when anything that determines the analysis result changes
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index frame_projects_owner_idx on frame_projects (owner_id, updated_at desc);

create table frame_runs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references frame_projects (id) on delete cascade,
  user_id              uuid references users (id) on delete set null,
  model_revision       integer not null,                    -- project revision at the time of the run
  model_fingerprint    text not null,
  engine_version       text not null,
  status               text not null,                       -- converged | not-converged | blocked ...
  label                text not null,                       -- analysis-only | provisional | user-defined | blocked
  settings             jsonb not null,                      -- the settings actually used
  summary              jsonb not null,                      -- combinations, design summary
  record               jsonb not null,                      -- the calculation record (sections, markdown)
  created_at           timestamptz not null default now()
);
create index frame_runs_project_idx on frame_runs (project_id, created_at desc);
