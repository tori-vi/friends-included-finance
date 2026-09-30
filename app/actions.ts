"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { employeeForId, isEmployeeId } from "@/lib/employees";
import { DEMONSTRATION_ROLE_COOKIE } from "@/lib/session";
import { requireRole } from "@/lib/authorization";
import { allocateExpense, approveSale, submitExpense, submitSale } from "@/lib/data";
import { parsePositiveAmount, required, splitFrom } from "@/lib/finance";
import { revalidatePath } from "next/cache";
import { dispatchPending } from '@/lib/telegram-delivery';

// Financial writes have committed before this runs. Delivery failures remain retryable.
async function sendQueuedMessages() { try { await dispatchPending(); } catch { /* Keep the durable outbox pending; never report a saved transaction as rejected. */ } }

function back(path: string, message: string) { redirect(`${path}?error=${encodeURIComponent(message)}`); }

export async function selectDemonstrationRole(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!isEmployeeId(employeeId)) throw new Error("Unknown demonstration employee.");

  const employee = employeeForId(employeeId);
  const cookieStore = await cookies();
  cookieStore.set(DEMONSTRATION_ROLE_COOKIE, employee.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/");
}

export async function createSale(formData: FormData) {
  try {
    const employee = await requireRole("submit_sale"); const shares = splitFrom(formData);
    const project = required(formData.get("project"), "Project"); if (project !== "A" && project !== "B") throw new Error("Choose Project A or B.");
    await submitSale(employee.id, { reference: required(formData.get("reference"), "Reference"), customer: required(formData.get("customer"), "Customer"), project, description: required(formData.get("description"), "Description"), amount: parsePositiveAmount(formData.get("amount"), "Amount"), proposed_richard_percentage: shares.richard, proposed_anastasia_percentage: shares.anastasia, proposed_jean_claude_percentage: shares["jean-claude"] });
  } catch (error) { back("/sales", error instanceof Error ? error.message : "Sale could not be saved."); }
  await sendQueuedMessages();
  revalidatePath("/"); revalidatePath("/sales"); revalidatePath("/approvals"); redirect("/sales?success=Sale%20saved%20as%20Pending%20approval.");
}

export async function createExpense(formData: FormData) {
  try {
    const employee = await requireRole("submit_expense"); const category = required(formData.get("category"), "Category").toLowerCase(); const allocation = required(formData.get("allocation"), "Allocation");
    if (!["materials", "travel", "other"].includes(category) || !["A", "B", "company_overhead"].includes(allocation)) throw new Error("Choose a valid category and allocation.");
    await submitExpense(employee.id, { reference: required(formData.get("reference"), "Reference"), description: required(formData.get("description"), "Description"), category, amount: parsePositiveAmount(formData.get("amount"), "Amount"), proposed_allocation: allocation as "A" | "B" | "company_overhead" });
  } catch (error) { back("/expenses", error instanceof Error ? error.message : "Expense could not be saved."); }
  await sendQueuedMessages();
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath("/approvals"); redirect("/expenses?success=Expense%20saved.");
}

export async function decideSale(formData: FormData) {
  try { const manager = await requireRole("review_decisions"); await approveSale(manager.id, required(formData.get("saleId"), "Sale"), splitFrom(formData)); }
  catch (error) { back("/approvals", error instanceof Error ? error.message : "Sale could not be approved."); }
  await sendQueuedMessages();
  revalidatePath("/"); revalidatePath("/approvals"); redirect("/approvals?success=Sale%20approved.");
}

export async function decideExpense(formData: FormData) {
  try { const manager = await requireRole("review_decisions"); const allocation = required(formData.get("allocation"), "Allocation"); if (!["A", "B", "company_overhead"].includes(allocation)) throw new Error("Choose a valid allocation."); await allocateExpense(manager.id, required(formData.get("expenseId"), "Expense"), allocation as "A" | "B" | "company_overhead"); }
  catch (error) { back("/approvals", error instanceof Error ? error.message : "Expense could not be allocated."); }
  await sendQueuedMessages();
  revalidatePath("/"); revalidatePath("/approvals"); redirect("/approvals?success=Expense%20allocation%20saved.");
}
