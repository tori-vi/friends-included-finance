import { telegramApi, botCommands } from '../lib/telegram-api';

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const configuredUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!base || !/^https:\/\//.test(base) || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error('Production app URL or Telegram webhook secret is missing or invalid.');
  const url = configuredUrl || `${base.replace(/\/$/,'')}/api/telegram/webhook`;
  if (!/^https:\/\/[^/]+\/api\/telegram\/webhook$/.test(url)) throw new Error('Telegram webhook URL must be an HTTPS /api/telegram/webhook endpoint.');
  await telegramApi('setMyCommands',{commands:botCommands});
  await telegramApi('setWebhook',{url,secret_token:secret,allowed_updates:['message'],drop_pending_updates:false,max_connections:1});
  const info = await telegramApi<{url:string;pending_update_count:number}>('getWebhookInfo');
  if (info.url !== url) throw new Error('Telegram did not retain the requested webhook URL.');
  console.log(`Telegram webhook configured. Pending updates: ${info.pending_update_count}.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Webhook setup failed.');process.exitCode=1;});
