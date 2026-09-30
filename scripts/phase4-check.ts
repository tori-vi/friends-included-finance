import { dashboard, submitSale, approveSale, submitExpense, allocateExpense } from '../lib/data';
import { retrySheet, salesHeaders, expenseHeaders } from '../lib/google-sheets-sync';
import { clearSheetValues, sheetValues } from '../lib/google-sheets-api';
import { supabase } from '../lib/supabase';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const stamp = Date.now().toString(36).toUpperCase();
const saleRef = `S-P4-${stamp}`;
const expenseRef = `E-P4-${stamp}`;
const failureRef = `S-P4-FAIL-${stamp}`;
const ids: string[] = [];
const sheetRows: {tab:string;row:number;width:string}[] = [];

async function job(recordId: string) {
  const { data, error } = await supabase().from('google_sheets_sync_status').select('*').eq('record_id',recordId).single();
  if (error) throw new Error('Sync job was not created.');
  return data;
}
async function matchingRows(tab: string, reference: string) {
  const rows = await sheetValues(`${tab}!A:Q`);
  return rows.map((row,index)=>({row,index:index+1})).filter(item=>item.row[0]===reference);
}

async function main() {
  assert(salesHeaders.length===17 && expenseHeaders.length===9,'Required headers are incomplete.');
  const before = await dashboard();
  const saleId = await submitSale('richard',{reference:saleRef,customer:'Temporary fictional customer',project:'A',description:'Temporary Phase 4 sync check',amount:12.34,proposed_richard_percentage:50,proposed_anastasia_percentage:30,proposed_jean_claude_percentage:20}); ids.push(saleId);
  let saleJob=await job(saleId); assert(saleJob.state==='sent','New sale did not sync.');
  let rows=await matchingRows('Sales',saleRef); assert(rows.length===1,'New sale was not written exactly once.'); sheetRows.push({tab:'Sales',row:rows[0].index,width:'Q'});
  assert(rows[0].row[10]==='' && rows[0].row[13]===0 && rows[0].row[16]==='Pending approval','Pending sale export is incorrect.');
  await approveSale('svetlana',saleId,{richard:20,anastasia:40,'jean-claude':40});
  saleJob=await job(saleId); assert(saleJob.state==='sent','Approved sale did not update.'); rows=await matchingRows('Sales',saleRef);
  assert(rows.length===1 && rows[0].row[10]===0.2 && rows[0].row[16]==='Approved','Approval did not update the original sale row.');

  const expenseId=await submitExpense('kevin',{reference:expenseRef,description:'Temporary Phase 4 expense sync check',category:'travel',amount:2.35,proposed_allocation:'B'}); ids.push(expenseId);
  let expenseJob=await job(expenseId); assert(expenseJob.state==='sent','New expense did not sync.');
  let expenseRows=await matchingRows('Expenses',expenseRef); assert(expenseRows.length===1,'New expense was not written exactly once.'); sheetRows.push({tab:'Expenses',row:expenseRows[0].index,width:'I'});
  await allocateExpense('svetlana',expenseId,'A'); expenseJob=await job(expenseId); assert(expenseJob.state==='sent','Expense decision did not update.'); expenseRows=await matchingRows('Expenses',expenseRef);
  assert(expenseRows.length===1 && expenseRows[0].row[7]==='A' && expenseRows[0].row[8]==='Allocated','Allocation did not update the original expense row.');

  const realId=process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID=`${realId}-unavailable`;
  const failedId=await submitSale('anastasia',{reference:failureRef,customer:'Temporary fictional customer',project:'B',description:'Temporary failure and retry check',amount:7.89,proposed_richard_percentage:0,proposed_anastasia_percentage:50,proposed_jean_claude_percentage:50}); ids.push(failedId);
  let failedJob=await job(failedId); assert(failedJob.state==='failed','Real Sheets failure was not recorded separately.');
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID=realId;
  const afterFailure=await dashboard();
  assert(afterFailure.pendingSales===before.pendingSales+1,'Failed export changed or lost the saved transaction.');
  await retrySheet('svetlana',failedJob.id); failedJob=await job(failedId); assert(failedJob.state==='sent','Retry did not succeed.');
  const failedRows=await matchingRows('Sales',failureRef); assert(failedRows.length===1,'Retry did not repair exactly one row.'); sheetRows.push({tab:'Sales',row:failedRows[0].index,width:'Q'});
  await retrySheet('svetlana',failedJob.id);
  assert((await matchingRows('Sales',failureRef)).length===1,'Repeated retry created a duplicate row.');
  let denied=false; try { await retrySheet('richard',failedJob.id); } catch { denied=true; }
  assert(denied,'A salesperson could invoke manager-only Sheets retry.');
  console.log('Phase 4 checks passed: create, update, failure state, retry, and idempotency.');
}

async function cleanup() {
  if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.endsWith('-unavailable')) process.env.GOOGLE_SHEETS_SPREADSHEET_ID=process.env.GOOGLE_SHEETS_SPREADSHEET_ID.slice(0,-12);
  for (const target of sheetRows) { try { await clearSheetValues(`${target.tab}!A${target.row}:${target.width}${target.row}`); } catch {} }
  if(ids.length) {
    const db=supabase();
    await db.from('telegram_notification_status').delete().in('record_id',ids);
    await db.from('google_sheets_sync_status').delete().in('record_id',ids);
    await db.from('sale_commission_decisions').delete().in('sale_id',ids);
    await db.from('expense_allocation_decisions').delete().in('expense_id',ids);
    await db.from('sales').delete().in('id',ids);
    await db.from('expenses').delete().in('id',ids);
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Phase 4 check failed.');process.exitCode=1;}).finally(cleanup);
