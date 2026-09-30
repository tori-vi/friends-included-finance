-- Friends Included Ltd: Supabase is the sole financial source of truth.
-- Apply in a new Supabase project before implementing transaction writes.
create extension if not exists pgcrypto;

create type public.employee_role as enum ('manager', 'salesperson', 'expense_reporter');
create type public.project_code as enum ('A', 'B');
create type public.expense_category as enum ('materials', 'travel', 'other');
create type public.expense_allocation as enum ('A', 'B', 'company_overhead');
create type public.sale_status as enum ('pending_approval', 'approved');
create type public.expense_status as enum ('awaiting_allocation', 'allocated');
create type public.delivery_state as enum ('pending', 'sent', 'failed');

create table public.employees (
  -- Stable codes intentionally match the five demonstration-selector identities.
  id text primary key check (id in ('svetlana', 'richard', 'anastasia', 'jean-claude', 'kevin')),
  display_name text not null unique,
  role public.employee_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Only a manager screen/service creates these links. A user cannot self-assign.
create table public.telegram_identity_links (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null,
  employee_id text not null references public.employees(id),
  linked_by_employee_id text not null references public.employees(id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  check (linked_by_employee_id <> employee_id)
);
create unique index active_telegram_link_per_employee on public.telegram_identity_links(employee_id) where unlinked_at is null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^S[0-9A-Za-z_-]+$'),
  submitted_at timestamptz not null default now(),
  salesperson_id text not null references public.employees(id),
  submission_telegram_chat_id bigint,
  customer text not null check (length(trim(customer)) > 0),
  project public.project_code not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  proposed_richard_percentage numeric(5,2) not null check (proposed_richard_percentage between 0 and 100),
  proposed_anastasia_percentage numeric(5,2) not null check (proposed_anastasia_percentage between 0 and 100),
  proposed_jean_claude_percentage numeric(5,2) not null check (proposed_jean_claude_percentage between 0 and 100),
  status public.sale_status not null default 'pending_approval',
  check (proposed_richard_percentage + proposed_anastasia_percentage + proposed_jean_claude_percentage = 100)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^E[0-9A-Za-z_-]+$'),
  submitted_at timestamptz not null default now(),
  reporter_id text not null references public.employees(id),
  submission_telegram_chat_id bigint,
  description text not null check (length(trim(description)) > 0),
  category public.expense_category not null,
  amount numeric(12,2) not null check (amount > 0),
  proposed_allocation public.expense_allocation not null,
  final_allocation public.expense_allocation,
  status public.expense_status not null,
  check ((proposed_allocation = 'company_overhead' and status = 'allocated' and final_allocation = 'company_overhead')
      or (proposed_allocation <> 'company_overhead' and status = 'awaiting_allocation' and final_allocation is null)
      or (proposed_allocation <> 'company_overhead' and status = 'allocated' and final_allocation is not null))
);

-- Final decisions are insert-once audit records. Approval services must update the base record and insert this row together.
create table public.sale_commission_decisions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id),
  manager_id text not null references public.employees(id),
  decided_at timestamptz not null default now(),
  final_richard_percentage numeric(5,2) not null check (final_richard_percentage between 0 and 100),
  final_anastasia_percentage numeric(5,2) not null check (final_anastasia_percentage between 0 and 100),
  final_jean_claude_percentage numeric(5,2) not null check (final_jean_claude_percentage between 0 and 100),
  commission_pool numeric(12,2) not null check (commission_pool >= 0),
  richard_commission numeric(12,2) not null check (richard_commission >= 0),
  anastasia_commission numeric(12,2) not null check (anastasia_commission >= 0),
  jean_claude_commission numeric(12,2) not null check (jean_claude_commission >= 0),
  check (final_richard_percentage + final_anastasia_percentage + final_jean_claude_percentage = 100),
  check (richard_commission + anastasia_commission + jean_claude_commission = commission_pool)
);

create table public.expense_allocation_decisions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null unique references public.expenses(id),
  manager_id text not null references public.employees(id),
  decided_at timestamptz not null default now(),
  final_allocation public.expense_allocation not null
);

create table public.google_sheets_sync_status (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('sale', 'expense')),
  record_id uuid not null,
  reference text not null,
  sheet_tab text not null check (sheet_tab in ('Sales', 'Expenses')),
  state public.delivery_state not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (record_type, record_id)
);

create table public.telegram_notification_status (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('sale', 'expense')),
  record_id uuid not null,
  event_type text not null check (event_type in ('submission_confirmation', 'manager_decision')),
  recipient_chat_id bigint,
  state public.delivery_state not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  unique (record_type, record_id, event_type, recipient_chat_id)
);

-- Cross-table reference safety: a sale and expense cannot share the same reference.
create or replace function public.reject_cross_type_duplicate_reference() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'sales' and exists (select 1 from public.expenses where reference = new.reference) then raise exception 'Reference % already exists as an expense', new.reference; end if;
  if tg_table_name = 'expenses' and exists (select 1 from public.sales where reference = new.reference) then raise exception 'Reference % already exists as a sale', new.reference; end if;
  return new;
end; $$;
create trigger sales_reference_is_global before insert or update of reference on public.sales for each row execute function public.reject_cross_type_duplicate_reference();
create trigger expenses_reference_is_global before insert or update of reference on public.expenses for each row execute function public.reject_cross_type_duplicate_reference();

-- No direct browser access. Server actions/API use the service role after application authorization.
alter table public.employees enable row level security;
alter table public.telegram_identity_links enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.sale_commission_decisions enable row level security;
alter table public.expense_allocation_decisions enable row level security;
alter table public.google_sheets_sync_status enable row level security;
alter table public.telegram_notification_status enable row level security;

-- The server-only service role needs explicit database privileges because public-table auto-exposure is disabled.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

insert into public.employees (id, display_name, role) values
  ('svetlana', 'Svetlana de Monte Carlo', 'manager'),
  ('richard', 'Richard Call Me Dick Darling', 'salesperson'),
  ('anastasia', 'Anastasia Ferrari', 'salesperson'),
  ('jean-claude', 'Jean-Claude Bērziņš', 'salesperson'),
  ('kevin', 'Kevin von Whatever', 'expense_reporter');
