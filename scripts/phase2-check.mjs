import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = `P2-${Date.now()}`;
const saleRef = `S${suffix}`;
const expenseRef = `E${suffix}`;

const fail = (error) => { if (error) throw new Error(error.message); };
try {
  let result = await db.from("sales").insert({ reference: saleRef, salesperson_id: "richard", customer: "Phase two check", project: "A", description: "Temporary automated check", amount: 123.45, proposed_richard_percentage: 34, proposed_anastasia_percentage: 33, proposed_jean_claude_percentage: 33, status: "pending_approval" }).select().single(); fail(result.error); assert.equal(result.data.status, "pending_approval");
  const sale = result.data;
  result = await db.from("sale_commission_decisions").insert({ sale_id: sale.id, manager_id: "svetlana", final_richard_percentage: 34, final_anastasia_percentage: 33, final_jean_claude_percentage: 33, commission_pool: 12.35, richard_commission: 4.2, anastasia_commission: 4.08, jean_claude_commission: 4.07 }); fail(result.error);
  result = await db.from("sales").update({ status: "approved" }).eq("id", sale.id).eq("status", "pending_approval"); fail(result.error);
  result = await db.from("expenses").insert({ reference: expenseRef, reporter_id: "kevin", description: "Temporary automated check", category: "materials", amount: 7.5, proposed_allocation: "A", status: "awaiting_allocation" }).select().single(); fail(result.error); assert.equal(result.data.status, "awaiting_allocation");
  const expense = result.data;
  result = await db.from("expense_allocation_decisions").insert({ expense_id: expense.id, manager_id: "svetlana", final_allocation: "B" }); fail(result.error);
  result = await db.from("expenses").update({ status: "allocated", final_allocation: "B" }).eq("id", expense.id).eq("status", "awaiting_allocation"); fail(result.error);
  const duplicateDecision = await db.from("sale_commission_decisions").insert({ sale_id: sale.id, manager_id: "svetlana", final_richard_percentage: 34, final_anastasia_percentage: 33, final_jean_claude_percentage: 33, commission_pool: 12.35, richard_commission: 4.2, anastasia_commission: 4.08, jean_claude_commission: 4.07 });
  assert.equal(duplicateDecision.error?.code, "23505");
  console.log("Database lifecycle check passed: pending states, manager decisions, allocation, and duplicate-decision protection.");
} finally {
  const { data: sale } = await db.from("sales").select("id").eq("reference", saleRef).maybeSingle();
  const { data: expense } = await db.from("expenses").select("id").eq("reference", expenseRef).maybeSingle();
  if (sale) { await db.from("sale_commission_decisions").delete().eq("sale_id", sale.id); await db.from("sales").delete().eq("id", sale.id); }
  if (expense) { await db.from("expense_allocation_decisions").delete().eq("expense_id", expense.id); await db.from("expenses").delete().eq("id", expense.id); }
}
