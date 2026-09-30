import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {supabase} from '../lib/supabase';
import {submitSale,submitExpense,approveSale,allocateExpense,recordsFor} from '../lib/data';
import {calculateCommission,splitFrom} from '../lib/finance';
import {deliverNotification,retryNotification,notificationText,type Notification} from '../lib/telegram-delivery';

async function main() {
  const db=supabase(), suffix=randomUUID().replaceAll('-','');
  const sale={reference:`S-TEMP-${suffix}`,customer:'Fictional test customer',project:'A' as const,description:'Temporary Phase 3 verification',amount:12.35,proposed_richard_percentage:34,proposed_anastasia_percentage:33,proposed_jean_claude_percentage:33};
  const expense={reference:`E-TEMP-${suffix}`,description:'Temporary fictional materials',amount:2.15,category:'materials',proposed_allocation:'B' as const};
  const ids:string[]=[];
  try {
    assert.deepEqual(calculateCommission(.15,{richard:34,anastasia:33,'jean-claude':33}),{richard:0,anastasia:.01,'jean-claude':.01,pool:.02});
    assert.deepEqual(calculateCommission(.10,{richard:50,anastasia:50,'jean-claude':0}),{richard:0,anastasia:.01,'jean-claude':0,pool:.01});
    assert.throws(()=>splitFrom(new FormData()),/required/);
    await assert.rejects(submitSale('kevin',sale),/Forbidden/);
    await assert.rejects(submitSale('svetlana',sale),/Forbidden/);
    await assert.rejects(submitExpense('richard',expense),/Forbidden/);
    await assert.rejects(submitExpense('svetlana',expense),/Forbidden/);
    await assert.rejects(submitSale('richard',{...sale,proposed_richard_percentage:60}),/total/);
    await assert.rejects(submitSale('richard',{...sale,customer:''}),/required/);
    await assert.rejects(submitExpense('kevin',{...expense,amount:0}),/positive/);
    await assert.rejects(submitExpense('kevin',{...expense,amount:-1}),/positive/);
    await assert.rejects(submitExpense('kevin',{...expense,category:'invalid'}),/Category/);
    const sid=await submitSale('richard',sale,{chatId:0,updateId:Date.now()}); ids.push(sid);
    const eid=await submitExpense('kevin',expense,{chatId:0,updateId:Date.now()+1}); ids.push(eid);
    await assert.rejects(submitSale('richard',sale),/already exists/);
    await assert.rejects(submitExpense('kevin',expense),/already exists/);
    const richard=await recordsFor({id:'richard',name:'',role:'salesperson'});
    const kevin=await recordsFor({id:'kevin',name:'',role:'expense_reporter'});
    assert.equal(richard.expenses.length,0); assert.equal(kevin.sales.length,0);
    await assert.rejects(approveSale('richard',sid,{richard:50,anastasia:30,'jean-claude':20}),/Forbidden/);
    await assert.rejects(allocateExpense('kevin',eid,'A'),/Forbidden/);
    await assert.rejects(retryNotification('richard',randomUUID()),/Forbidden/);
    const deniedLink=await db.rpc('link_telegram_employee',{manager:'richard',user_id:0,employee:'kevin'}); assert.ok(deniedLink.error);
    const immutable=await db.from('sales').update({submission_telegram_chat_id:1}).eq('id',sid); assert.ok(immutable.error);
    await approveSale('svetlana',sid,{richard:50,anastasia:30,'jean-claude':20});
    await allocateExpense('svetlana',eid,'A');
    await assert.rejects(approveSale('svetlana',sid,{richard:50,anastasia:30,'jean-claude':20}),/already approved/);
    await assert.rejects(allocateExpense('svetlana',eid,'B'),/already allocated/);
    const savedSale=await db.from('sales').select('*').eq('id',sid).single(); assert.ifError(savedSale.error); assert.equal(savedSale.data.status,'approved'); assert.equal(savedSale.data.proposed_richard_percentage,34);
    const savedExpense=await db.from('expenses').select('*').eq('id',eid).single(); assert.ifError(savedExpense.error); assert.equal(savedExpense.data.final_allocation,'A'); assert.equal(savedExpense.data.proposed_allocation,'B');
    const queue=await db.from('telegram_notification_status').select('*').in('record_id',ids); assert.ifError(queue.error); assert.equal(queue.data?.length,4);
    const approval=queue.data!.find(n=>n.record_id===sid&&n.event_type==='manager_decision') as Notification;
    assert.match(notificationText(approval),/34% → 50%/);
    const confirmation=queue.data!.find(n=>n.record_id===sid&&n.event_type==='submission_confirmation')!;
    await deliverNotification(confirmation.id); // Real Telegram rejects chat ID 0; no person receives it.
    let status=await db.from('telegram_notification_status').select('*').eq('id',confirmation.id).single(); assert.ifError(status.error); assert.equal(status.data.state,'failed'); assert.equal(status.data.sent_at,null);
    await deliverNotification(confirmation.id);
    status=await db.from('telegram_notification_status').select('*').eq('id',confirmation.id).single(); assert.equal(status.data.state,'failed'); assert.equal(status.data.attempts,2);
    const stillSaved=await db.from('sales').select('status').eq('id',sid).single(); assert.equal(stillSaved.data?.status,'approved');
    console.log('PASS: shared validation, role denials, privacy, rounding, duplicates, immutable chat, atomic decisions, original proposals, real failed delivery and retry.');
  } finally {
    if(ids.length) {
      for(const [table,column] of [['telegram_notification_status','record_id'],['sale_commission_decisions','sale_id'],['expense_allocation_decisions','expense_id'],['sales','id'],['expenses','id']]) {
        const {error}=await db.from(table).delete().in(column,ids); if(error) throw new Error(`Temporary test cleanup failed for ${table}`);
      }
      console.log('Temporary Phase 3 test records removed.');
    }
  }
}
main().catch(e=>{console.error(e instanceof Error ? e.message : 'Phase 3 check failed.');process.exitCode=1;});
