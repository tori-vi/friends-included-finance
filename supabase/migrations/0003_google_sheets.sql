-- Durable, versioned export queue. Financial writes never depend on Google.
begin;
create sequence public.google_sheet_row_number start 2;
alter table public.google_sheets_sync_status
  add column sheet_row bigint not null default nextval('public.google_sheet_row_number'),
  add column version bigint not null default 1,
  add column lease_token uuid,
  add column lease_until timestamptz;
create unique index google_sheet_reserved_row on public.google_sheets_sync_status(sheet_row);

create function public.queue_google_sheet() returns trigger language plpgsql set search_path=public as $$
begin
  insert into google_sheets_sync_status(record_type,record_id,reference,sheet_tab)
  values(case when TG_TABLE_NAME='sales' then 'sale' else 'expense' end,new.id,new.reference,
    case when TG_TABLE_NAME='sales' then 'Sales' else 'Expenses' end)
  on conflict(record_type,record_id) do update set state='pending',
    version=google_sheets_sync_status.version+1,updated_at=now(),last_error=null;
  return new;
end $$;
create trigger sales_google_sheet after insert or update on public.sales for each row execute function public.queue_google_sheet();
create trigger expenses_google_sheet after insert or update on public.expenses for each row execute function public.queue_google_sheet();

create function public.claim_google_sheet(sync_id uuid, token uuid) returns setof public.google_sheets_sync_status
language sql set search_path=public as $$
  update google_sheets_sync_status set lease_token=token,lease_until=now()+interval '2 minutes',
    attempts=attempts+1,last_attempt_at=now()
  where id=sync_id and (lease_until is null or lease_until<now())
  returning *;
$$;
revoke all on function public.claim_google_sheet(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_google_sheet(uuid,uuid) to service_role;
grant usage,select on sequence public.google_sheet_row_number to service_role;
insert into public.google_sheets_sync_status(record_type,record_id,reference,sheet_tab)
select 'sale',id,reference,'Sales' from public.sales on conflict do nothing;
insert into public.google_sheets_sync_status(record_type,record_id,reference,sheet_tab)
select 'expense',id,reference,'Expenses' from public.expenses on conflict do nothing;
commit;
