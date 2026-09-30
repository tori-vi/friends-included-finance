import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
const id = process.argv[2];
if (!id || !/^[\w-]+$/.test(id)) throw new Error('Invalid spreadsheet ID.');
const path = '.env.local';
const lines = readFileSync(path, 'utf8').split(/\r?\n/);
const key = 'GOOGLE_SHEETS_SPREADSHEET_ID';
let found = false;
const updated = lines.map(line => {
  if (!line.startsWith(`${key}=`)) return line;
  found = true; return `${key}=${id}`;
});
if (!found) updated.push(`${key}=${id}`);
writeFileSync(path, `${updated.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
chmodSync(path, 0o600);
console.log('Spreadsheet ID saved to private local environment.');
