import { dispatchSheets } from '../lib/google-sheets-sync';
async function main() {
  console.log('Google Sheets pending-queue worker running. Ctrl+C stops it.');
  for (;;) {
    try { await dispatchSheets(); } catch { console.error('Sheets queue unavailable; will retry.'); }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
main().catch(() => { console.error('Sheets worker stopped.'); process.exitCode=1; });
