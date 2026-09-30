import { AppShell } from "@/components/app-shell";
import { currentDemonstrationEmployee } from "@/lib/authorization";
import { dashboard, recordsFor } from "@/lib/data";
import { euros } from "@/lib/finance";

export default async function Home() {
  const employee = await currentDemonstrationEmployee();
  const [summary, records] = await Promise.all([dashboard(), recordsFor(employee)]);
  return <AppShell employee={employee}>
    <section className="card instructions"><h2>How to test the workflow</h2><p>Choose a fictional employee under <strong>Demonstration role</strong>. Richard, Anastasia, and Jean-Claude enter sales; Kevin enters expenses. Choose Svetlana to review pending items under Manager approvals and inspect company results here. Telegram submissions use the same rules after the manager links a Telegram user ID.</p></section>
    {employee?.role === "manager" && <><section><p className="eyebrow">Live financial dashboard</p><h2>Approved results</h2></section><div className="grid" aria-label="Financial summary"><ProjectCard label="Project A" value={summary.project.A} /><ProjectCard label="Project B" value={summary.project.B} /><article className="card"><h2>Company result</h2><p className="metric">{euros(summary.companyResult)}</p><p className="muted">Income {euros(summary.approvedIncome)} · commissions {euros(summary.commissions)} · all expenses {euros(summary.totalExpenses)}</p><p>Overhead: {euros(summary.overhead)}<br />Awaiting allocation: {euros(summary.awaiting)}</p></article></div><div className="grid small-grid"><article className="card"><h2>Pending workflow</h2><p>{summary.pendingSales} sales awaiting approval</p><p>{summary.pendingExpenses} expenses awaiting allocation</p></article><article className="card"><h2>Commission earned</h2><p>Richard: {euros(summary.earned.richard)}<br />Anastasia: {euros(summary.earned.anastasia)}<br />Jean-Claude: {euros(summary.earned["jean-claude"])}</p></article></div></>}
    <section className="records"><p className="eyebrow">Your records</p><h2>{employee?.role === "manager" ? "All transactions" : "Your submissions"}</h2>{records.sales.length + records.expenses.length === 0 ? <p className="empty">No transactions yet. Totals will always be calculated from stored records.</p> : <><h3>Sales</h3><RecordTable rows={records.sales.map((sale) => [sale.reference, sale.customer, `Project ${sale.project}`, euros(sale.amount), sale.status.replaceAll("_", " ")])} /><h3>Expenses</h3><RecordTable rows={records.expenses.map((expense) => [expense.reference, expense.description, expense.final_allocation ?? "Awaiting allocation", euros(expense.amount), expense.status.replaceAll("_", " ")])} /></>}</section>
  </AppShell>;
}

function ProjectCard({ label, value }: { label: string; value: { income: number; commission: number; expenses: number } }) { return <article className="card"><h2>{label}</h2><p className="metric">{euros(value.income - value.commission - value.expenses)}</p><p className="muted">Result</p><p>Approved income: {euros(value.income)}<br />Commission expense: {euros(value.commission)}<br />Allocated expenses: {euros(value.expenses)}</p></article>; }
function RecordTable({ rows }: { rows: string[][] }) { return <div className="table-wrap"><table><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>; }
