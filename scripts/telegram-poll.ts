import {supabase} from '../lib/supabase';
import {telegramApi,botCommands} from '../lib/telegram-api';
import {processTelegramUpdate,type TelegramUpdate} from '../lib/telegram-bot';
import {dispatchPending} from '../lib/telegram-delivery';

async function main() {
  const me = await telegramApi<{username:string}>('getMe');
  const webhook = await telegramApi<{url:string}>('getWebhookInfo');
  if (webhook.url) throw new Error('A webhook is configured. Stop it explicitly before local polling.');
  await telegramApi('setMyCommands',{commands:botCommands});
  console.log(`Connected to @${me.username}. Local polling is active; Ctrl+C stops it.`);
  let stopping = false;
  process.on('SIGINT',() => {stopping=true;}); process.on('SIGTERM',() => {stopping=true;});
  while (!stopping) {
    const {data,error} = await supabase().from('telegram_bot_state').select('next_update_id').eq('id',true).single();
    if (error) throw new Error('Telegram migration is missing or unavailable.');
    const updates = await telegramApi<TelegramUpdate[]>('getUpdates',{offset:data.next_update_id,timeout:20,allowed_updates:['message']});
    for (const update of updates) {
      await processTelegramUpdate(update);
      const {error:saveError} = await supabase().from('telegram_bot_state').update({next_update_id:update.update_id+1}).eq('id',true);
      if (saveError) throw new Error('Could not save Telegram polling position.');
    }
    await dispatchPending();
    if (process.argv.includes('--once')) break;
  }
}
main().catch(() => {console.error('Telegram receiver stopped safely. Check network, credentials, migration, and that only one receiver runs. No credentials were logged.');process.exitCode=1;});
