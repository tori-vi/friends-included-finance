"use client";

import { useFormStatus } from "react-dom";
import { selectDemonstrationRole } from "@/app/actions";
import { demonstrationEmployees, type DemonstrationEmployee } from "@/lib/employees";

function RoleFields({ employee }: { employee: DemonstrationEmployee | null }) {
  const { pending } = useFormStatus();
  return <>
    <label htmlFor="employeeId">Demonstration role</label>
    <select key={employee?.id ?? ""} id="employeeId" name="employeeId" defaultValue={employee?.id ?? ""} disabled={pending} required>
      <option value="" disabled>Select a fictional employee</option>
      {demonstrationEmployees.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.role.replace("_", " ")}</option>)}
    </select>
    <button type="submit" disabled={pending}>{pending ? "Switching role…" : "Use role"}</button>
    <span role="status" aria-live="polite">{pending ? "Waiting for role confirmation." : "Choose a role, then press Use role."}</span>
  </>;
}

export function RoleSelector({ employee }: { employee: DemonstrationEmployee | null }) {
  return <form action={selectDemonstrationRole} className="role-form"><RoleFields employee={employee} /></form>;
}
