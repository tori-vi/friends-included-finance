import { clearSheetValues, sheetValues } from '../lib/google-sheets-api';
import { supabase } from '../lib/supabase';

const saleReference = 'S-P5-WEB-20260930';
const expenseReference = 'E-P5-TG-20260930';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function record(table: 'sales' | 'expenses', reference: string) {
  const { data, error } = await supabase().from(table).select('*').eq('reference', reference).single();
  if (error) throw new Error(`${reference} was not found in Supabase.`);
  return data;
}

async function matchingRows(tab: 'Sales' | 'Expenses', reference: string) {
  const rows = await sheetValues(`${tab}!A:Q`);
  return rows.filter((row) => row[0] === reference);
}

async function verify() {
  const db = supabase();
  const sale = await record('sales', saleReference);
  const expense = await record('expenses', expenseReference);
  const [{ data: saleDecision }, { data: expenseDecision }, { data: syncJobs }, { data: deliveries }] = await Promise.all([
    db.from('sale_commission_decisions').select('*').eq('sale_id', sale.id).single(),
    db.from('expense_allocation_decisions').select('*').eq('expense_id', expense.id).single(),
    db.from('google_sheets_sync_status').select('*').in('record_id', [sale.id, expense.id]),
    db.from('telegram_notification_status').select('*').eq('record_id', expense.id),
  ]);
  const [saleRows, expenseRows] = await Promise.all([
    matchingRows('Sales', saleReference),
    matchingRows('Expenses', expenseReference),
  ]);

  assert(sale.status === 'approved', 'The deployed website sale is not approved.');
  assert(saleDecision, 'The sale decision audit row is missing.');
  assert(Number(saleDecision.commission_pool) === 12.35, 'The sale commission pool is not 10% rounded to cents.');
  assert(expense.status === 'allocated' && expense.final_allocation === 'A', 'The Telegram expense decision was not saved.');
  assert(expenseDecision?.final_allocation === 'A', 'The expense decision audit row is missing or incorrect.');
  assert(syncJobs?.length === 2 && syncJobs.every((job) => job.state === 'sent'), 'One or more Google Sheets sync jobs are not sent.');
  assert(saleRows.length === 1 && saleRows[0][16] === 'Approved', 'The Sales tab does not contain exactly one updated approved row.');
  assert(expenseRows.length === 1 && expenseRows[0][7] === 'A' && expenseRows[0][8] === 'Allocated', 'The Expenses tab does not contain exactly one updated allocated row.');
  assert(deliveries?.some((item) => item.event_type === 'submission_confirmation' && item.state === 'sent'), 'The Telegram submission confirmation was not recorded as sent.');
  assert(deliveries?.some((item) => item.event_type === 'manager_decision' && item.state === 'sent'), 'The Telegram manager-decision notification was not recorded as sent.');

  console.log('Phase 5 deployed smoke verification passed: Supabase, website decisions, Sheets create/update, and Telegram confirmation/decision delivery agree.');
}

async function cleanup() {
  const db = supabase();
  const remove = async (table: string, column: string, ids: string[]) => {
    const { error: deleteError } = await db.from(table).delete().in(column, ids);
    if (deleteError) throw new Error(`Could not clean temporary rows from ${table}.`);
  };
  const { data: records, error } = await db
    .from('google_sheets_sync_status')
    .select('record_id,record_type,sheet_row')
    .in('reference', [saleReference, expenseReference]);
  if (error) throw new Error('Could not locate temporary sync rows for cleanup.');
  for (const item of records ?? []) {
    const tab = item.record_type === 'sale' ? 'Sales' : 'Expenses';
    const width = item.record_type === 'sale' ? 'Q' : 'I';
    await clearSheetValues(`${tab}!A${item.sheet_row}:${width}${item.sheet_row}`);
  }

  const ids = (records ?? []).map((item) => item.record_id);
  if (ids.length) {
    await remove('telegram_notification_status', 'record_id', ids);
    await remove('google_sheets_sync_status', 'record_id', ids);
    await remove('sale_commission_decisions', 'sale_id', ids);
    await remove('expense_allocation_decisions', 'expense_id', ids);
    await remove('sales', 'id', ids);
    await remove('expenses', 'id', ids);
  }
  const [{ data: remainingSales }, { data: remainingExpenses }, saleRows, expenseRows] = await Promise.all([
    db.from('sales').select('id').eq('reference', saleReference),
    db.from('expenses').select('id').eq('reference', expenseReference),
    matchingRows('Sales', saleReference),
    matchingRows('Expenses', expenseReference),
  ]);
  assert(remainingSales?.length === 0 && remainingExpenses?.length === 0, 'Temporary Supabase records remain after cleanup.');
  assert(saleRows.length === 0 && expenseRows.length === 0, 'Temporary Google Sheets rows remain after cleanup.');
  console.log('Phase 5 temporary Supabase records and corresponding Sheet rows were removed.');
}

async function main() {
  const mode = process.argv[2] ?? 'verify';
  if (mode === 'verify') await verify();
  else if (mode === 'cleanup') await cleanup();
  else throw new Error('Use verify or cleanup.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Phase 5 smoke check failed.');
  process.exitCode = 1;
});
