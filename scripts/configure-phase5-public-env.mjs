import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const path = '.env.local';
const values = {
  NEXT_PUBLIC_APP_URL: 'https://friends-included-finance-jet-five.vercel.app',
  NEXT_PUBLIC_OWNER_NAME: 'Viktorija Skrinda',
  NEXT_PUBLIC_GITHUB_URL: 'https://github.com/tori-vi/friends-included-finance',
  NEXT_PUBLIC_TELEGRAM_BOT_URL: 'https://t.me/friends_included_homework_bot',
};

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
const remaining = new Map(Object.entries(values));
const updated = lines.map((line) => {
  const separator = line.indexOf('=');
  if (separator < 1) return line;
  const key = line.slice(0, separator);
  if (!remaining.has(key)) return line;
  const value = remaining.get(key);
  remaining.delete(key);
  return `${key}=${value}`;
});

for (const [key, value] of remaining) updated.push(`${key}=${value}`);

writeFileSync(path, `${updated.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
chmodSync(path, 0o600);
console.log('Phase 5 public deployment values are present in the private local environment.');
