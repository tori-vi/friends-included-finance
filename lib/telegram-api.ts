import 'server-only';

// Never log fetch errors: the request URL contains the bot token.
export async function telegramApi<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram token is not configured.');
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000), cache: 'no-store',
    });
  } catch { throw new Error('Telegram connection failed; delivery is unconfirmed. Retry is available.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = result?.error_code ?? response.status;
    if (code === 403) throw new Error('Telegram refused delivery. The recipient may have blocked the bot; unblock it and send /start.');
    if (code === 400) throw new Error('Telegram could not find this chat. The recipient must start the bot in a private chat.');
    if (code === 409) throw new Error('Another poller or webhook is active. Run only one Telegram receiver.');
    throw new Error(`Telegram request failed (code ${Number(code)}). Retry later.`);
  }
  return result.result as T;
}

export const botCommands = [
  {command:'start',description:'Show your Telegram ID and setup instructions'},
  {command:'sale',description:'Salesperson: sale submission format'},
  {command:'expense',description:'Kevin: expense submission format'},
  {command:'help',description:'Help and submission commands'},
];
