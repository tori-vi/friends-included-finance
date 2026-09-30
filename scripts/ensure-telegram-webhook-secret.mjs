import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
const path='.env.local';
const key='TELEGRAM_WEBHOOK_SECRET';
const lines=readFileSync(path,'utf8').split(/\r?\n/);
let value='',found=false;
const updated=lines.map(line=>{
  if(!line.startsWith(`${key}=`)) return line;
  found=true; value=line.slice(key.length+1) || randomBytes(32).toString('base64url');
  return `${key}=${value}`;
});
if(!found) updated.push(`${key}=${randomBytes(32).toString('base64url')}`);
writeFileSync(path,`${updated.join('\n').replace(/\n+$/,'')}\n`,{mode:0o600});
chmodSync(path,0o600);
console.log('Telegram webhook secret is present in the private local environment.');
