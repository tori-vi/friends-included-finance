import 'server-only';
import { createSign } from 'node:crypto';

let cached: { token: string; expires: number } | undefined;
async function accessToken() {
  if (cached && cached.expires > Date.now()) return cached.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google service-account configuration is missing.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature: string;
  try { signature = createSign('RSA-SHA256').update(message).sign(key, 'base64url'); }
  catch { throw new Error('Google private-key configuration is invalid.'); }
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${message}.${signature}` }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Google authentication failed. Check the service-account credentials.');
  const result = await response.json();
  cached = { token: result.access_token, expires: Date.now() + 3300000 };
  return cached.token;
}

export function spreadsheetLink() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  return id && /^[\w-]+$/.test(id) ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

export async function sheetsRequest(path: string, method = 'GET', body?: unknown) {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id || !/^[\w-]+$/.test(id)) throw new Error('Spreadsheet ID is missing or invalid.');
  const token = await accessToken();
  let response: Response;
  try { response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), cache: 'no-store' }); }
  catch { throw new Error('Google Sheets could not be reached. Retry synchronization.'); }
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}). Check spreadsheet access and retry.`);
  return response.json();
}

export async function sheetValues(range: string): Promise<(string | number)[][]> {
  const result = await sheetsRequest(`/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  return result.values ?? [];
}
export async function writeSheetValues(range: string, values: (string | number)[][]) {
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, 'PUT', { range, values });
}
export async function clearSheetValues(range: string) {
  await sheetsRequest(`/values/${encodeURIComponent(range)}:clear`, 'POST', {});
}
