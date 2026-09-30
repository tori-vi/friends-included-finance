import 'server-only';
import { supabase } from './supabase';
import { telegramApi } from './telegram-api';
import { euros } from './finance';
import { assertEmployee } from './employee-permissions';

type RecordSnapshot = {
  reference: string; amount: number; project?: string; description: string;
  proposed_allocation?: string; status: string; salesperson_id?: string; reporter_id?: string;
  submission_telegram_chat_id?: number;
  proposed_richard_percentage?: number; proposed_anastasia_percentage?: number; proposed_jean_claude_percentage?: number;
};
type DecisionSnapshot = {commission_pool?: number; final_allocation?: string; final_richard_percentage?: number; final_anastasia_percentage?: number; final_jean_claude_percentage?: number; richard_commission?: number; anastasia_commission?: number; jean_claude_commission?: number};
export type Notification = { id: string; record_id: string; record_type: string; event_type: string; recipient_chat_id: number | null; state: 'pending'|'sent'|'failed'; attempts: number; last_error: string|null; sent_at: string|null; payload: {record:RecordSnapshot; decision?:DecisionSnapshot} };
export function allocationLabel(value?: string) { return value === 'company_overhead' ? 'Company overhead' : `Project ${value}`; }

export function notificationText(n: Notification) {
  const r = n.payload.record, d = n.payload.decision;
  if (n.event_type === 'submission_confirmation') return `${r.reference} saved — ${euros(r.amount)}\n${r.project ? allocationLabel(r.project) : allocationLabel(r.proposed_allocation)}\nStatus: ${r.status.replaceAll('_',' ')}.`;
  if (!d) throw new Error('Notification snapshot is incomplete.');
  if (n.record_type === 'expense') return `Expense ${r.reference} — allocation ${r.proposed_allocation === d.final_allocation ? 'confirmed as proposed' : 'changed'}.\n${euros(r.amount)}: ${r.description}\nProposed: ${allocationLabel(r.proposed_allocation)}\nApproved: ${allocationLabel(d.final_allocation)}.`;
  const people = ['richard','anastasia','jean_claude'] as const;
  const changed = people.some(p => r[`proposed_${p}_percentage`] !== d[`final_${p}_percentage`]);
  return `Sale ${r.reference} approved — commission split ${changed ? 'changed' : 'unchanged'}.\nSale ${euros(r.amount)}; total commission ${euros(d.commission_pool ?? 0)}.\n` + people.map(p => `${p === 'jean_claude' ? 'Jean-Claude' : p === 'richard' ? 'Richard' : 'Anastasia'}: ${r[`proposed_${p}_percentage`]}% → ${d[`final_${p}_percentage`]}% (${euros(d[`${p}_commission`] ?? 0)})`).join('\n');
}

export async function deliverNotification(id: string) {
  const db = supabase();
  const {data,error} = await db.rpc('claim_telegram_delivery',{notification:id});
  if (error) throw new Error('Could not claim notification delivery.');
  const notification = data?.[0] as Notification | undefined;
  if (!notification) return; // Already sent, being delivered, or no recipient.
  let sent: {message_id:number};
  try { sent = await telegramApi('sendMessage',{chat_id:notification.recipient_chat_id,text:notificationText(notification)}); }
  catch (error) {
    const {error: updateError} = await db.from('telegram_notification_status').update({state:'failed',lease_until:null,last_error:error instanceof Error ? error.message : 'Delivery unconfirmed; retry available.'}).eq('id',id);
    if (updateError) throw new Error('Delivery failed and status could not be saved. It remains unconfirmed.');
    return;
  }
  const {error: updateError} = await db.from('telegram_notification_status').update({state:'sent',sent_at:new Date().toISOString(),telegram_message_id:sent.message_id,last_error:null,lease_until:null}).eq('id',id);
  if (updateError) throw new Error('Telegram accepted the message but delivery status could not be saved. A retry may repeat the message.');
}

export async function dispatchPending() {
  const {data,error} = await supabase().from('telegram_notification_status').select('id').eq('state','pending').not('recipient_chat_id','is',null).order('last_attempt_at',{ascending:true,nullsFirst:true}).limit(25);
  if (error) throw new Error('Cannot read Telegram delivery queue.');
  for (const n of data ?? []) await deliverNotification(n.id);
}

export async function retryNotification(managerId: string,id: string) {
  await assertEmployee(managerId,'review_decisions');
  const db = supabase();
  const {data,error} = await db.from('telegram_notification_status').select('*').eq('id',id).single();
  if (error || !data) throw new Error('Notification not found.');
  if (data.state === 'sent') return;
  // Never retarget a bot transaction. Only resolve an absent website recipient.
  if (!data.recipient_chat_id && !data.payload.record.submission_telegram_chat_id) {
    const employee = data.payload.record.salesperson_id ?? data.payload.record.reporter_id;
    const {data:link,error:linkError} = await db.from('telegram_identity_links').select('telegram_chat_id').eq('employee_id',employee).is('unlinked_at',null).maybeSingle();
    if (linkError) throw new Error('Cannot read employee Telegram link.');
    if (!link) throw new Error('No Telegram recipient linked');
    const {error:updateError} = await db.from('telegram_notification_status').update({recipient_chat_id:link.telegram_chat_id}).eq('id',id).is('recipient_chat_id',null);
    if (updateError) throw new Error('Cannot save recipient.');
  }
  await deliverNotification(id);
}
