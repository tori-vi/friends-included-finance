'use server';
import { requireRole } from '@/lib/authorization';
import { retrySheet } from '@/lib/google-sheets-sync';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
export async function retryGoogleSheet(form: FormData) {
  try { const employee = await requireRole('review_decisions'); await retrySheet(employee.id, String(form.get('id') ?? '')); }
  catch { redirect('/sheets?error=Retry%20could%20not%20be%20completed.'); }
  revalidatePath('/sheets'); redirect('/sheets');
}
