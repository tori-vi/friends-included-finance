import 'server-only';
import { supabase } from './supabase';
import { telegramApi } from './telegram-api';
import { submitSale,submitExpense } from './data';
import { dispatchPending } from './telegram-delivery';
import { assertEmployee } from './employee-permissions';

export type TelegramUpdate = {update_id:number; message?:{message_id:number; from?:{id:number; is_bot?:boolean}; chat:{id:number;type:string}; text?:string}};
const saleHelp = 'Send one message using this format (replace every <field>):\n/sale <reference> | <customer> | <A or B> | <description> | <amount EUR> | <Richard %> | <Anastasia %> | <Jean-Claude %>\nUse a decimal point, no € sign. All three percentages are required and must total 100. Do not use | inside a field.';
const expenseHelp = 'Send one message using this format (replace every <field>):\n/expense <reference> | <description> | <amount EUR> | <Materials, Travel or Other> | <A, B or Company overhead>\nUse a decimal point, no € sign. Do not use | inside a field.';

export async function processTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!Number.isSafeInteger(update.update_id) || !message?.from || message.from.is_bot || message.chat.type !== 'private' || !Number.isSafeInteger(message.from.id) || message.from.id !== message.chat.id) return;
  const db = supabase(), chatId = message.chat.id, userId = message.from.id;
  const reply = (text:string) => telegramApi('sendMessage',{chat_id:chatId,text,reply_markup:{keyboard:[[{text:'/sale'},{text:'/expense'}],[{text:'/help'}]],resize_keyboard:true}});
  const text = message.text?.trim() ?? '';
  const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const command = match?.[1]?.toLowerCase();
  if (command === 'start') {
    const {error} = await db.from('telegram_contacts').upsert({telegram_user_id:userId,telegram_chat_id:chatId,last_seen_at:new Date().toISOString()});
    if (error) throw new Error('Cannot save Telegram contact.');
    await reply(`Welcome to Friends Included Finance.\nYour Telegram user ID: ${userId}\nAsk Svetlana to link this ID on the website’s Telegram setup screen. You cannot choose a role here.\nUse /sale or /expense for instructions. Fictional data only.`); return;
  }
  const {data:link,error} = await db.from('telegram_identity_links').select('employee_id').eq('telegram_user_id',userId).is('unlinked_at',null).maybeSingle();
  if (error) throw new Error('Cannot verify Telegram identity.');
  if (!link) { await reply('Submission refused: your Telegram account is not linked to an employee. Send /start, then ask Svetlana to link your Telegram user ID on the website.'); return; }
  if (command === 'help' || !['sale','expense'].includes(command ?? '')) { await reply(`Your linked employee: ${link.employee_id}. Only Svetlana can change this.\n/sale — salespeople only\n/expense — Kevin only\nSend a command to see its format. Manager decisions are made on the website.`); return; }
  // An update can be delivered again after a restart; it must not create another transaction.
  const table = command === 'sale' ? 'sales' : 'expenses';
  const {data:existing,error:existingError} = await db.from(table).select('id').eq('telegram_update_id',update.update_id).maybeSingle();
  if (existingError) throw new Error('Cannot check previous submission.');
  if (existing) { await dispatchPending(); return; }
  let id: string;
  try {
    await assertEmployee(link.employee_id,command === 'sale' ? 'submit_sale' : 'submit_expense');
    if (!match?.[2]) { await reply(command === 'sale' ? saleHelp : expenseHelp); return; }
    const fields = match[2].split('|').map(v => v.trim());
    if (fields.some(v => !v) || fields.length !== (command === 'sale' ? 8 : 5)) throw new Error(`All fields are required, separated by |.\n${command === 'sale' ? saleHelp : expenseHelp}`);
    if (command === 'sale') {
      const [reference,customer,project,description,amount,richard,anastasia,jeanClaude] = fields;
      id = await submitSale(link.employee_id,{reference,customer,project:project as 'A'|'B',description,amount:Number(amount),proposed_richard_percentage:Number(richard),proposed_anastasia_percentage:Number(anastasia),proposed_jean_claude_percentage:Number(jeanClaude)},{chatId,updateId:update.update_id});
    } else {
      const [reference,description,amount,category,allocation] = fields;
      const proposed = /^(company overhead|company_overhead)$/i.test(allocation) ? 'company_overhead' : allocation;
      id = await submitExpense(link.employee_id,{reference,description,amount:Number(amount),category:category.toLowerCase(),proposed_allocation:proposed as 'A'|'B'|'company_overhead'},{chatId,updateId:update.update_id});
    }
  } catch (error) {
    await reply(`Not saved: ${error instanceof Error ? error.message : 'Please check the fields and try again.'}`); return;
  }
  // Transaction + confirmation event already committed. Sending cannot roll them back.
  if (id) await dispatchPending();
}
