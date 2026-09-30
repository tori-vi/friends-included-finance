"use client";

import { useRef } from "react";
import { selectDemonstrationRole } from "@/app/actions";
import { demonstrationEmployees, type DemonstrationEmployee } from "@/lib/employees";

export function RoleSelector({ employee }: { employee: DemonstrationEmployee | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  return <form action={selectDemonstrationRole} className="role-form" ref={formRef}>
    <label htmlFor="employeeId">Demonstration role</label>
    <select id="employeeId" name="employeeId" defaultValue={employee?.id ?? ""} onChange={() => formRef.current?.requestSubmit()}>
      <option value="" disabled>Select a fictional employee</option>
      {demonstrationEmployees.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.role.replace("_", " ")}</option>)}
    </select>
  </form>;
}
