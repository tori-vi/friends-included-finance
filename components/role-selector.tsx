"use client";

import { useTransition } from "react";
import { selectDemonstrationRole } from "@/app/actions";
import { demonstrationEmployees, type DemonstrationEmployee } from "@/lib/employees";

export function RoleSelector({ employee }: { employee: DemonstrationEmployee | null }) {
  const [pending, startTransition] = useTransition();
  return <form action={selectDemonstrationRole} className="role-form" aria-busy={pending}>
    <label htmlFor="employeeId">Demonstration role</label>
    <select id="employeeId" name="employeeId" value={employee?.id ?? ""} disabled={pending} onChange={(event) => {
      const formData = new FormData();
      formData.set("employeeId", event.currentTarget.value);
      startTransition(async () => { await selectDemonstrationRole(formData); });
    }}>
      <option value="" disabled>Select a fictional employee</option>
      {demonstrationEmployees.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.role.replace("_", " ")}</option>)}
    </select>
    <span role="status" aria-live="polite">{pending ? "Switching role…" : ""}</span>
  </form>;
}
