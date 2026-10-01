-- Website submissions have no immutable Telegram chat snapshot. Resolve their
-- employee link at the moment a manager makes a decision; bot submissions keep
-- their original chat destination forever.
begin;

create or replace function public.apply_manager_decision() returns trigger language plpgsql set search_path=public as $$
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

 -- A non-null snapshot means this was submitted through Telegram. Never retarget it.
 destination := (rec->>'submission_telegram_chat_id')::bigint;
 if destination is null then
   -- A website submission has no chat snapshot: use this employee's active link now.
   select telegram_chat_id into destination
   from telegram_identity_links
   where employee_id=actor and unlinked_at is null
   order by linked_at desc
   limit 1;
 end if;

 insert into telegram_notification_status(record_type,record_id,event_type,recipient_chat_id,payload,last_error)
 values(kind,(rec->>'id')::uuid,'manager_decision',destination,jsonb_build_object('record',rec,'decision',to_jsonb(new)),case when destination is null then 'No Telegram recipient linked' end);
 return new;
end $$;

commit;
