import "server-only";
import { syncTransaction } from './google-sheets-sync';
import { supabase } from "@/lib/supabase";
import { calculateCommission } from "@/lib/finance";
import { assertEmployee } from './employee-permissions';
import { validateSale, validateExpense } from './submission-validation';
import type { DemonstrationEmployee } from "@/lib/employees";

type Sale = { id: string; reference: string; submitted_at: string; salesperson_id: string; customer: string; project: "A" | "B"; description: string; amount: number; proposed_richard_percentage: number; proposed_anastasia_percentage: number; proposed_jean_claude_percentage: number; status: "pending_approval" | "approved" };
type Expense = { id: string; reference: string; submitted_at: string; reporter_id: string; description: string; category: string; amount: number; proposed_allocation: "A" | "B" | "company_overhead"; final_allocation: "A" | "B" | "company_overhead" | null; status: "awaiting_allocation" | "allocated" };
type Decision = { sale_id: string; final_richard_percentage: number; final_anastasia_percentage: number; final_jean_claude_percentage: number; commission_pool: number; richard_commission: number; anastasia_commission: number; jean_claude_commission: number };

export async function recordsFor(employee: DemonstrationEmployee | null) {
  const db = supabase();
  const salesQuery = db.from("sales").select("*").order("submitted_at", { ascending: false });
  const expensesQuery = db.from("expenses").select("*").order("submitted_at", { ascending: false });
  if (employee?.role !== "manager") {
    if (!employee) return { sales: [] as Sale[], expenses: [] as Expense[], decisions: [] as Decision[] };
    salesQuery.eq("salesperson_id", employee.id);
    expensesQuery.eq("reporter_id", employee.id);
  }
  const [{ data: sales, error: salesError }, { data: expenses, error: expensesError }] = await Promise.all([salesQuery, expensesQuery]);
  if (salesError || expensesError) throw new Error(salesError?.message ?? expensesError?.message);
  const ids = (sales ?? []).map((sale) => sale.id);
  const { data: decisions, error: decisionsError } = ids.length ? await db.from("sale_commission_decisions").select("*").in("sale_id", ids) : { data: [], error: null };
  if (decisionsError) throw new Error(decisionsError.message);
  return { sales: (sales ?? []) as Sale[], expenses: (expenses ?? []) as Expense[], decisions: (decisions ?? []) as Decision[] };
}

export async function dashboard() {
  const { sales, expenses, decisions } = await recordsFor({ id: "svetlana", name: "", role: "manager" });
  const bySale = new Map(decisions.map((decision) => [decision.sale_id, decision]));
  const project = { A: { income: 0, commission: 0, expenses: 0 }, B: { income: 0, commission: 0, expenses: 0 } };
  const earned = { richard: 0, anastasia: 0, "jean-claude": 0 };
  for (const sale of sales.filter((item) => item.status === "approved")) {
    const decision = bySale.get(sale.id); if (!decision) continue;
    project[sale.project].income += Number(sale.amount); project[sale.project].commission += Number(decision.commission_pool);
    earned.richard += Number(decision.richard_commission); earned.anastasia += Number(decision.anastasia_commission); earned["jean-claude"] += Number(decision.jean_claude_commission);
  }
  let overhead = 0, awaiting = 0, totalExpenses = 0;
  for (const expense of expenses) {
    totalExpenses += Number(expense.amount);
    const allocation = expense.final_allocation;
    if (!allocation) awaiting += Number(expense.amount); else if (allocation === "company_overhead") overhead += Number(expense.amount); else project[allocation].expenses += Number(expense.amount);
  }
  const approvedIncome = project.A.income + project.B.income;
  const commissions = project.A.commission + project.B.commission;
  return { project, earned, overhead, awaiting, approvedIncome, commissions, totalExpenses, companyResult: approvedIncome - commissions - totalExpenses, pendingSales: sales.filter((sale) => sale.status === "pending_approval").length, pendingExpenses: expenses.filter((expense) => expense.status === "awaiting_allocation").length };
}

export async function submitSale(employeeId: string, input: Pick<Sale, "reference" | "customer" | "project" | "description" | "amount" | "proposed_richard_percentage" | "proposed_anastasia_percentage" | "proposed_jean_claude_percentage">, origin?: {chatId: number; updateId: number}) {
  await assertEmployee(employeeId,'submit_sale'); validateSale(input);
  const { data, error } = await supabase().from("sales").insert({ ...input, salesperson_id: employeeId, status: "pending_approval", submission_telegram_chat_id: origin?.chatId ?? null, telegram_update_id: origin?.updateId ?? null }).select('id').single();
  if (error) throw new Error(error.code === "23505" ? "That reference already exists." : error.message);
  await syncTransaction(data.id);
  return data.id as string;
}

export async function submitExpense(employeeId: string, input: Pick<Expense, "reference" | "description" | "category" | "amount" | "proposed_allocation">, origin?: {chatId: number; updateId: number}) {
  await assertEmployee(employeeId,'submit_expense'); validateExpense(input);
  const overhead = input.proposed_allocation === "company_overhead";
  const { data, error } = await supabase().from("expenses").insert({ ...input, reporter_id: employeeId, status: overhead ? "allocated" : "awaiting_allocation", final_allocation: overhead ? "company_overhead" : null, submission_telegram_chat_id: origin?.chatId ?? null, telegram_update_id: origin?.updateId ?? null }).select('id').single();
  if (error) throw new Error(error.code === "23505" ? "That reference already exists." : error.message);
  await syncTransaction(data.id);
  return data.id as string;
}

export async function approveSale(managerId: string, saleId: string, shares: { richard: number; anastasia: number; "jean-claude": number }) {
  await assertEmployee(managerId,'review_decisions');
  const db = supabase(); const { data: sale, error } = await db.from("sales").select("*").eq("id", saleId).single();
  if (error || !sale) throw new Error("Sale not found."); if (sale.status !== "pending_approval") throw new Error("This sale is already approved.");
  const commissions = calculateCommission(Number(sale.amount), shares);
  const { error: decisionError } = await db.from("sale_commission_decisions").insert({ sale_id: saleId, manager_id: managerId, final_richard_percentage: shares.richard, final_anastasia_percentage: shares.anastasia, final_jean_claude_percentage: shares["jean-claude"], commission_pool: commissions.pool, richard_commission: commissions.richard, anastasia_commission: commissions.anastasia, jean_claude_commission: commissions["jean-claude"] });
  if (decisionError) throw new Error(decisionError.code === "23505" ? "This sale is already approved." : decisionError.message);
  // Database trigger atomically updates status and creates the decision outbox event.
  await syncTransaction(saleId);
}

export async function allocateExpense(managerId: string, expenseId: string, allocation: "A" | "B" | "company_overhead") {
  await assertEmployee(managerId,'review_decisions');
  if (!['A','B','company_overhead'].includes(allocation)) throw new Error('Choose a valid allocation.');
  const db = supabase(); const { data: expense, error } = await db.from("expenses").select("*").eq("id", expenseId).single();
  if (error || !expense) throw new Error("Expense not found."); if (expense.status !== "awaiting_allocation") throw new Error("This expense is already allocated.");
  const { error: decisionError } = await db.from("expense_allocation_decisions").insert({ expense_id: expenseId, manager_id: managerId, final_allocation: allocation });
  if (decisionError) throw new Error(decisionError.code === "23505" ? "This expense is already allocated." : decisionError.message);
  // Database trigger atomically updates allocation and creates the outbox event.
  await syncTransaction(expenseId);
}
