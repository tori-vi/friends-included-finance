import Link from "next/link";
import { type DemonstrationEmployee } from "@/lib/employees";
import { RoleSelector } from "@/components/role-selector";
import { publicSiteDetails } from '@/lib/site-links';

export function AppShell({ children, employee }: { children: React.ReactNode; employee: DemonstrationEmployee | null }) {
  const links = publicSiteDetails();
  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">Friends Included Ltd</p><h1>Finance desk</h1><p className="subtitle">Fictional wedding guests, real bookkeeping rules.</p></div>
      <RoleSelector employee={employee} />
    </header>
    <nav className="nav" aria-label="Main navigation"><Link href="/">Dashboard</Link><Link href="/sales">Enter sale</Link><Link href="/expenses">Enter expense</Link><Link href="/approvals">Manager approvals</Link><Link href="/telegram">Telegram setup &amp; delivery</Link></nav>
    {employee ? <p className="notice">Acting as <strong>{employee.name}</strong> ({employee.role.replace("_", " ")}). Server actions will verify this role before processing changes.</p> : <p className="notice">Choose a demonstration role to explore the role-aware workflow.</p>}
    <nav className="nav" aria-label="Integration status"><Link href="/sheets">Google Sheets sync</Link></nav>
    {children}
    <footer className="footer"><p><strong>{links.owner}</strong> · Friends Included finance-system homework</p><nav aria-label="Project links">{links.app && <a href={links.app}>Live application</a>}{links.github && <a href={links.github} target="_blank" rel="noreferrer">GitHub source</a>}{links.telegram && <a href={links.telegram} target="_blank" rel="noreferrer">Telegram bot</a>}{links.sheets && <a href={links.sheets} target="_blank" rel="noreferrer">Google Sheets copy</a>}</nav></footer>
  </main>;
}
