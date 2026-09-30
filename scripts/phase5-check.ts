import { POST, GET } from '../app/api/telegram/webhook/route';

const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
if(!secret) throw new Error('Webhook secret missing.');
const request=(header:string,body:string)=>new Request('https://example.invalid/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':header},body});
async function main(){
  const unauthorized=await POST(request('wrong-secret','{}'));
  if(unauthorized.status!==401) throw new Error('Webhook accepted an invalid secret.');
  const invalid=await POST(request(secret,'not-json'));
  if(invalid.status!==400) throw new Error('Webhook accepted invalid JSON.');
  const harmless=await POST(request(secret,JSON.stringify({update_id:1,message:{from:{id:1,is_bot:true},chat:{id:1,type:'private'},text:'/start'}})));
  if(harmless.status!==200) throw new Error('Webhook rejected a valid harmless update.');
  const health=await GET(); const body=await health.json();
  if(!body.configured) throw new Error('Webhook health says configuration is missing.');
  console.log('Phase 5 webhook checks passed: authentication, parsing, and safe update handling.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Phase 5 check failed.');process.exitCode=1;});
