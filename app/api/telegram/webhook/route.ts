import { timingSafeEqual } from 'node:crypto';
import { processTelegramUpdate, type TelegramUpdate } from '@/lib/telegram-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers.get('x-telegram-bot-api-secret-token');
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected), right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });
  const raw = await request.text();
  if (raw.length > 256_000) return new Response('Payload too large', { status: 413 });
  let update: TelegramUpdate;
  try { update = JSON.parse(raw) as TelegramUpdate; }
  catch { return new Response('Invalid JSON', { status: 400 }); }
  try { await processTelegramUpdate(update); }
  catch { return new Response('Temporary processing failure', { status: 503 }); }
  return Response.json({ ok: true });
}

export function GET() {
  return Response.json({ service: 'Friends Included Telegram webhook', configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) });
}
