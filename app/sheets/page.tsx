import { AppShell } from '@/components/app-shell';
import { currentDemonstrationEmployee } from '@/lib/authorization';
import { recordsFor } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { spreadsheetLink } from '@/lib/google-sheets-api';
import { retryGoogleSheet } from './actions';
export default async function SheetsPage({ searchParams }: { searchParams: Promise<{error?: string}> }) {
  const employee = await currentDemonstrationEmployee();
  const records = await recordsFor(employee);
  const ids = [...records.sales,...records.expenses].map(record => record.id);
  const { data: jobs, error } = ids.length ? await supabase().from('google_sheets_sync_status').select('id,reference,state,last_error,attempts').in('record_id',ids).order('updated_at',{ascending:false}) : {data: [],error:null};
  const link = spreadsheetLink(); const params = await searchParams;
  return <AppShell employee={employee}><section className="card"><h2>Google Sheets synchronization</h2>
    <p>Supabase is the source of truth. Google Sheets is an automatic viewing copy. Spreadsheet edits do not change financial totals.</p>
    {employee?.role === 'manager' && link && <p><a href={link} target="_blank" rel="noreferrer">Open Sales and Expenses spreadsheet</a> (restricted access)</p>}
    <p>Staff see their own submissions. Svetlana can retry pending or failed deliveries.</p>
    {(error || params.error) && <p role="alert">Could not load or retry synchronization. Refresh and try again.</p>}
    {!jobs?.length ? <p>No submissions to synchronize yet.</p> : <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Sync state</th><th>Attempts</th><th>Details</th><th>Retry</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}>
      <td>{job.reference}</td><td>{job.state === 'sent' ? 'Synced' : job.state === 'failed' ? 'Sync failed' : 'Sync pending'}</td><td>{job.attempts}</td><td>{job.last_error ?? '—'}</td><td>{employee?.role === 'manager' && job.state !== 'sent' && <form action={retryGoogleSheet}><input type="hidden" name="id" value={job.id}/><button type="submit">Retry sync</button></form>}</td>
    </tr>)}</tbody></table></div>}
  </section></AppShell>;
}
