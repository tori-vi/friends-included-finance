import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import { assertEmployee } from './employee-permissions';
import { sheetValues, writeSheetValues } from './google-sheets-api';

export const salesHeaders = ['Reference','Submitted at (UTC)','Salesperson','Customer','Project','Description','Amount (EUR)','Proposed Richard %','Proposed Anastasia %','Proposed Jean-Claude %','Approved Richard %','Approved Anastasia %','Approved Jean-Claude %','Richard earned (EUR)','Anastasia earned (EUR)','Jean-Claude earned (EUR)','Status'];
export const expenseHeaders = ['Reference','Submitted at (UTC)','Reporter','Description','Category','Amount (EUR)','Proposed allocation','Final allocation','Status'];
const allocation = (value: string | null) => value === 'company_overhead' ? 'Company overhead' : value ?? '';
const category = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const dateValue = (date: string) => Date.parse(date) / 86400000 + 25569;

export async function syncSheetRecord(id: string) {
  const db = supabase(), token = randomUUID();
  const { data, error } = await db.rpc('claim_google_sheet', { sync_id: id, token });
  if (error) throw new Error('Could not claim spreadsheet synchronization.');
  const job = data?.[0];
  if (!job) return;
  let failure: string | null = null;
  try {
    const sale = job.record_type === 'sale';
    const { data: record, error: readError } = await db.from(sale ? 'sales' : 'expenses').select('*').eq('id', job.record_id).single();
    if (readError || !record) throw new Error('Source transaction could not be read.');
    const { data: employee, error: employeeError } = await db.from('employees').select('display_name').eq('id', sale ? record.salesperson_id : record.reporter_id).single();
    if (employeeError) throw new Error('Employee could not be read.');
    let row: (string | number)[];
    if (sale) {
      const { data: decision, error: decisionError } = await db.from('sale_commission_decisions').select('*').eq('sale_id', record.id).maybeSingle();
      if (decisionError || (record.status === 'approved' && !decision)) throw new Error('Approved commission decision is missing.');
      const approved = record.status === 'approved' ? decision : null;
      row = [record.reference,dateValue(record.submitted_at),employee.display_name,record.customer,record.project,record.description,Number(record.amount),...['richard','anastasia','jean_claude'].map(p => Number(record[`proposed_${p}_percentage`])/100),...['richard','anastasia','jean_claude'].map(p => approved ? Number(approved[`final_${p}_percentage`])/100 : ''),...['richard','anastasia','jean_claude'].map(p => approved ? Number(approved[`${p}_commission`]) : 0),approved ? 'Approved' : 'Pending approval'];
    } else row = [record.reference,dateValue(record.submitted_at),employee.display_name,record.description,category(record.category),Number(record.amount),allocation(record.proposed_allocation),allocation(record.final_allocation),record.status === 'allocated' ? 'Allocated' : 'Awaiting allocation'];
    const keys = await sheetValues(`${job.sheet_tab}!A:A`);
    const matches = keys.flatMap((r, i) => r[0] === job.reference ? [i + 1] : []);
    if (matches.length > 1) throw new Error('Duplicate references exist in the spreadsheet. Remove the extra copy before retrying.');
    // A database-reserved row makes retries safe even after an ambiguous HTTP timeout.
    const target = matches[0] ?? Number(job.sheet_row);
    if (!matches.length && keys[target - 1]?.[0]) throw new Error('Reserved spreadsheet row is occupied. Restore the sheet layout before retrying.');
    await writeSheetValues(`${job.sheet_tab}!A${target}:${sale ? 'Q' : 'I'}${target}`, [row]);
  } catch (error) { failure = error instanceof Error ? error.message : 'Spreadsheet synchronization failed.'; }
  const { error: finishError } = await db.from('google_sheets_sync_status').update({ state: failure ? 'failed' : 'sent', last_error: failure, lease_until: null, lease_token: null, updated_at: new Date().toISOString() }).eq('id', id).eq('lease_token', token).eq('version', job.version);
  if (finishError) throw new Error('Could not record spreadsheet delivery status.');
  // A newer decision arrived during delivery: retain pending and release this worker's lease.
  await db.from('google_sheets_sync_status').update({ lease_until: null, lease_token: null }).eq('id',id).eq('lease_token',token);
}

export async function syncTransaction(recordId: string) {
  // Never report a committed financial transaction as rejected because an export failed.
  try {
    const { data, error } = await supabase().from('google_sheets_sync_status').select('id').eq('record_id', recordId).single();
    if (error || !data) return; // durable queue/worker recovers interrupted requests
    await syncSheetRecord(data.id);
  } catch { /* The durable pending/failed state remains visible for retry. */ }
}

export async function retrySheet(managerId: string, id: string) {
  await assertEmployee(managerId, 'review_decisions');
  await syncSheetRecord(id);
}
export async function dispatchSheets() {
  const { data, error } = await supabase().from('google_sheets_sync_status').select('id').eq('state','pending').order('updated_at').limit(25);
  if (error) throw new Error('Could not read spreadsheet queue.');
  for (const job of data ?? []) await syncSheetRecord(job.id);
}
