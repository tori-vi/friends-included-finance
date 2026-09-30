'use server';
import { requireRole } from '@/lib/authorization';
import { supabase } from '@/lib/supabase';
import { retryNotification } from '@/lib/telegram-delivery';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function linkTelegram(form:FormData) {
  try {
    const manager = await requireRole('review_decisions');
    const userId = String(form.get('userId') ?? '');
    if (!/^\d+$/.test(userId) || !Number.isSafeInteger(Number(userId))) throw new Error('Enter a valid Telegram user ID.');
    const {error} = await supabase().rpc('link_telegram_employee',{manager:manager.id,user_id:userId,employee:String(form.get('employeeId') ?? '')});
    if (error) throw new Error(error.message);
  } catch (error) { redirect(`/telegram?error=${encodeURIComponent(error instanceof Error ? error.message : 'Link could not be saved.')}`); }
  revalidatePath('/telegram'); redirect('/telegram?success=Employee%20link%20saved.%20Older%20transactions%20keep%20their%20original%20submitter%20and%20chat.');
}
export async function retryTelegram(form:FormData) {
  try { const manager=await requireRole('review_decisions'); await retryNotification(manager.id,String(form.get('notificationId') ?? '')); }
  catch(error) { redirect(`/telegram?error=${encodeURIComponent(error instanceof Error ? error.message : 'Retry could not be completed.')}`); }
  revalidatePath('/telegram'); redirect('/telegram?success=Retry%20processed.%20Check%20the%20delivery%20status%20below.');
}
