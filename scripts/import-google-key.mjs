// Local-only setup helper. Never prints credential contents.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';

try {
  const filename = process.argv[2];
  if (!filename) throw new Error();
  const key = JSON.parse(readFileSync(filename, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== 'compact-booking-510010-d9' || key.client_email !== 'friends-included-sheets@compact-booking-510010-d9.iam.gserviceaccount.com') throw new Error();
  createPrivateKey(key.private_key);
  const values = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: key.client_email,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: key.private_key,
  };
  let env = readFileSync('.env.local', 'utf8');
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    env = pattern.test(env) ? env.replace(pattern, () => line) : `${env.trimEnd()}\n${line}\n`;
  }
  writeFileSync('.env.local', env, { mode: 0o600 });
  chmodSync('.env.local', 0o600);
  console.log('Google service-account credentials imported privately into .env.local.');
} catch {
  console.error('Credential import failed. Verify the downloaded JSON file; its contents were not displayed.');
  process.exitCode = 1;
}
