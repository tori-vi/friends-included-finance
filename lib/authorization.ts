import { cookies } from "next/headers";
import { DEMONSTRATION_ROLE_COOKIE } from "@/lib/session";
import { employeeForId, type DemonstrationEmployee } from "@/lib/employees";
import { canPerform, type Capability } from "@/lib/authorization-policy";

export { canPerform, type Capability } from "@/lib/authorization-policy";

export async function currentDemonstrationEmployee(): Promise<DemonstrationEmployee | null> {
  const employeeId = (await cookies()).get(DEMONSTRATION_ROLE_COOKIE)?.value;
  if (!employeeId) return null;
  try { return employeeForId(employeeId); } catch { return null; }
}

// Call this inside every future Server Action and Route Handler before it writes or reveals data.
export async function requireRole(capability: Capability): Promise<DemonstrationEmployee> {
  const employee = await currentDemonstrationEmployee();
  if (!employee || !canPerform(employee.role, capability)) {
    throw new Error("Forbidden: the selected role cannot perform this action.");
  }
  return employee;
}
