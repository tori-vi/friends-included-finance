import { AppShell } from '@/components/app-shell';
import { currentDemonstrationEmployee } from '@/lib/authorization';
import { demonstrationEmployees } from '@/lib/employees';
import { recordsFor } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import {type Notification} from '@/lib/telegram-delivery';
import {linkTelegram,retryTelegram} from './actions';

export default async function TelegramPage({searchParams}:{searchParams:Promise<{error?:string;success?:string}>}) {
  const employee=await currentDemonstrationEmployee(), message=await searchParams;
  const manager=employee?.role==='manager';
  const records=await recordsFor(employee);
  const ids=[...records.sales,...records.expenses].map(r=>r.id);
  const db=supabase();
  const [contacts,links,notifications]=await Promise.all([
    manager ? db.from('telegram_contacts').select('*').order('last_seen_at',{ascending:false}) : Promise.resolve({data:[],error:null}),
    manager ? db.from('telegram_identity_links').select('*').is('unlinked_at',null) : Promise.resolve({data:[],error:null}),
    ids.length ? db.from('telegram_notification_status').select('*').in('record_id',ids).order('last_attempt_at',{ascending:false}) : Promise.resolve({data:[],error:null}),
  ]);
  if(contacts.error||links.error||notifications.error) throw new Error('Telegram setup data is unavailable. Check the database migration.');
  return <AppShell employee={employee}>
    <section className="page-lead"><p className="eyebrow">Real Telegram bot</p><h2>Telegram setup and delivery</h2><p><a href="https://t.me/friends_included_homework_bot" target="_blank" rel="noreferrer">Open Friends Included Finance in Telegram</a>, press Start, then ask Svetlana to link the user ID shown by the bot.</p><p>For local testing, keep <code>npm run telegram:poll</code> running. The bot accepts private chats only.</p></section>
    {message.error&&<p className="error">{message.error}</p>}{message.success&&<p className="success">{message.success}</p>}
    {manager ? <section className="card"><h3>Link a Telegram user to an employee</h3><p>Only this manager screen assigns roles. Re-linking changes future submissions, never old transactions or their notification destinations.</p>
      <form action={linkTelegram} className="inline-form"><label>Telegram user ID<input name="userId" required inputMode="numeric" pattern="[0-9]+" list="telegram-contacts" /></label><datalist id="telegram-contacts">{contacts.data?.map(c=><option key={c.telegram_user_id} value={c.telegram_user_id} />)}</datalist>
      <label>Fictional employee<select name="employeeId">{demonstrationEmployees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button className="primary">Save employee link</button></form>
      <h4>Accounts that have started this bot</h4>{contacts.data?.length ? <ul>{contacts.data.map(c=><li key={c.telegram_user_id}>User ID {c.telegram_user_id} — {links.data?.find(l=>l.telegram_user_id===c.telegram_user_id)?.employee_id ?? 'Not linked'}</li>)}</ul> : <p>No contacts yet. Send /start while local polling is running.</p>}
    </section> : <p className="notice">Only Svetlana can link Telegram accounts or retry delivery. You can see delivery status for your own transactions below.</p>}
    <section className="records"><h3>Transaction message delivery</h3><p>A failed message never undoes a saved transaction or manager decision. After a network timeout, a retry may repeat a message; it never repeats the financial transaction.</p>
    {!notifications.data?.length&&<p className="empty">No transaction messages yet.</p>}
    {(notifications.data as Notification[] ?? []).map(n=><article className="decision" key={n.id}><h4>{n.payload.record?.reference ?? n.record_id} — {n.event_type.replaceAll('_',' ')}</h4><p>Status: <strong>{!n.recipient_chat_id?'No Telegram recipient linked':n.state}</strong> · Attempts: {n.attempts}</p>{n.last_error&&<p>{n.last_error}</p>}{n.sent_at&&<p>Sent: {new Date(n.sent_at).toLocaleString('en-GB')}</p>}{manager&&n.state!=='sent'&&<form action={retryTelegram}><input type="hidden" name="notificationId" value={n.id}/><button className="primary">Retry delivery</button></form>}</article>)}
    </section>
  </AppShell>;
}
