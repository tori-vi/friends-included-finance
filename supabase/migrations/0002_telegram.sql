-- Phase 3: durable Telegram outbox, identity setup and atomic decisions.
begin;
alter table public.telegram_identity_links drop constraint telegram_identity_links_check;
create table public.telegram_contacts (
  telegram_user_id bigint primary key,
  telegram_chat_id bigint not null,
  last_seen_at timestamptz not null default now()
);
create table public.telegram_bot_state (
  id boolean primary key default true check(id),
  next_update_id bigint not null default 0
);
insert into public.telegram_bot_state(id) values(true);
alter table public.telegram_contacts enable row level security;
alter table public.telegram_bot_state enable row level security;
grant select,insert,update,delete on public.telegram_contacts,public.telegram_bot_state to service_role;
alter table public.sales add column telegram_update_id bigint unique;
alter table public.expenses add column telegram_update_id bigint unique;
alter table public.telegram_notification_status add column payload jsonb not null default '{}';
alter table public.telegram_notification_status add column lease_until timestamptz;
alter table public.telegram_notification_status add column telegram_message_id bigint;
create unique index telegram_one_event on public.telegram_notification_status(record_type,record_id,event_type);

-- Snapshot bot identity/chat at insert; remapping never rewrites old records.
create function public.guard_submission() returns trigger language plpgsql set search_path=public as $$
declare actor text; expected employee_role;
begin
  if tg_op = 'UPDATE' then
    if new.submission_telegram_chat_id is distinct from old.submission_telegram_chat_id
       or new.telegram_update_id is distinct from old.telegram_update_id then
      raise exception 'Original Telegram destination cannot change';
    end if;
    if (tg_table_name='sales' and to_jsonb(new)->>'salesperson_id' is distinct from to_jsonb(old)->>'salesperson_id')
      or (tg_table_name='expenses' and to_jsonb(new)->>'reporter_id' is distinct from to_jsonb(old)->>'reporter_id') then
      raise exception 'Original submitter cannot change';
    end if;
    return new;
  end if;
  actor := coalesce(to_jsonb(new)->>'salesperson_id',to_jsonb(new)->>'reporter_id');
  expected := case when tg_table_name='sales' then 'salesperson'::employee_role else 'expense_reporter'::employee_role end;
  if not exists(select 1 from employees where id=actor and role=expected and is_active) then
    raise exception 'Forbidden: invalid submission role';
  end if;
  return new;
end $$;
create trigger sales_guard before insert or update on public.sales for each row execute function public.guard_submission();
create trigger expenses_guard before insert or update on public.expenses for each row execute function public.guard_submission();

create function public.queue_submission() returns trigger language plpgsql set search_path=public as $$
declare destination bigint; actor text;
begin
 actor := coalesce(to_jsonb(new)->>'salesperson_id',to_jsonb(new)->>'reporter_id');
 destination := new.submission_telegram_chat_id;
 if destination is null then select telegram_chat_id into destination from telegram_identity_links where employee_id=actor and unlinked_at is null; end if;
 insert into telegram_notification_status(record_type,record_id,event_type,recipient_chat_id,payload,last_error)
 values(case when tg_table_name='sales' then 'sale' else 'expense' end,new.id,'submission_confirmation',destination,jsonb_build_object('record',to_jsonb(new)),case when destination is null then 'No Telegram recipient linked' end);
 return new;
end $$;
create trigger sales_confirmation after insert on public.sales for each row execute function public.queue_submission();
create trigger expenses_confirmation after insert on public.expenses for each row execute function public.queue_submission();

-- A decision insert, base-record update and outbox insert share one DB transaction.
create function public.apply_manager_decision() returns trigger language plpgsql set search_path=public as $$
declare rec jsonb; destination bigint; actor text; kind text;
begin
 if not exists(select 1 from employees where id=new.manager_id and role='manager' and is_active) then raise exception 'Forbidden: manager required'; end if;
 if tg_table_name='sale_commission_decisions' then
   kind := 'sale';
   select to_jsonb(s) into rec from sales s where id=new.sale_id for update;
   if rec->>'status' <> 'pending_approval' then raise exception 'Sale already approved'; end if;
   update sales set status='approved' where id=new.sale_id;
   actor := rec->>'salesperson_id';
 else
   kind := 'expense';
   select to_jsonb(e) into rec from expenses e where id=new.expense_id for update;
   if rec->>'status' <> 'awaiting_allocation' then raise exception 'Expense already allocated'; end if;
   update expenses set status='allocated',final_allocation=new.final_allocation where id=new.expense_id;
   actor := rec->>'reporter_id';
 end if;
 destination := (rec->>'submission_telegram_chat_id')::bigint;
 if destination is null then select telegram_chat_id into destination from telegram_identity_links where employee_id=actor and unlinked_at is null; end if;
 insert into telegram_notification_status(record_type,record_id,event_type,recipient_chat_id,payload,last_error)
 values(kind,(rec->>'id')::uuid,'manager_decision',destination,jsonb_build_object('record',rec,'decision',to_jsonb(new)),case when destination is null then 'No Telegram recipient linked' end);
 return new;
end $$;
create trigger sale_decision_atomic after insert on public.sale_commission_decisions for each row execute function public.apply_manager_decision();
create trigger expense_decision_atomic after insert on public.expense_allocation_decisions for each row execute function public.apply_manager_decision();

create function public.link_telegram_employee(manager text,user_id bigint,employee text) returns void
language plpgsql set search_path=public as $$
declare chat bigint;
begin
 if not exists(select 1 from employees where id=manager and role='manager' and is_active) then raise exception 'Forbidden: manager required'; end if;
 if not exists(select 1 from employees where id=employee and is_active) then raise exception 'Unknown employee'; end if;
 select telegram_chat_id into chat from telegram_contacts where telegram_user_id=user_id;
 if chat is null then raise exception 'This user must first send /start to the bot'; end if;
 perform pg_advisory_xact_lock(871231);
 update telegram_identity_links set unlinked_at=now() where employee_id=employee and unlinked_at is null;
 insert into telegram_identity_links(telegram_user_id,telegram_chat_id,employee_id,linked_by_employee_id)
 values(user_id,chat,employee,manager)
 on conflict(telegram_user_id) do update set telegram_chat_id=excluded.telegram_chat_id,employee_id=excluded.employee_id,linked_by_employee_id=manager,linked_at=now(),unlinked_at=null;
end $$;

create function public.claim_telegram_delivery(notification uuid) returns setof public.telegram_notification_status
language sql set search_path=public as $$
 update telegram_notification_status set lease_until=now()+interval '90 seconds',attempts=attempts+1,last_attempt_at=now()
 where id=notification and state<>'sent' and recipient_chat_id is not null and (lease_until is null or lease_until<now()) returning *;
$$;
revoke all on function public.link_telegram_employee(text,bigint,text),public.claim_telegram_delivery(uuid) from public,anon,authenticated;
grant execute on function public.link_telegram_employee(text,bigint,text),public.claim_telegram_delivery(uuid) to service_role;
commit;
