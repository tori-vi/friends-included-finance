import 'server-only';
import { supabase } from './supabase';
import { canPerform, type Capability } from './authorization-policy';

export async function assertEmployee(employeeId: string, capability: Capability) {
  const {data,error} = await supabase().from('employees').select('id,role,is_active').eq('id',employeeId).single();
  if (error || !data?.is_active || !canPerform(data.role,capability)) throw new Error('Forbidden: this employee cannot perform that action.');
}
