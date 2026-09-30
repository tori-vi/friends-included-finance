export type Role = "manager" | "salesperson" | "expense_reporter";

export type DemonstrationEmployee = { id: string; name: string; role: Role };

export const demonstrationEmployees: readonly DemonstrationEmployee[] = [
  { id: "svetlana", name: "Svetlana de Monte Carlo", role: "manager" },
  { id: "richard", name: 'Richard “Call Me Dick” Darling', role: "salesperson" },
  { id: "anastasia", name: "Anastasia Ferrari", role: "salesperson" },
  { id: "jean-claude", name: "Jean-Claude Bērziņš", role: "salesperson" },
  { id: "kevin", name: "Kevin von Whatever", role: "expense_reporter" },
] as const;

export function isEmployeeId(value: string): value is (typeof demonstrationEmployees)[number]["id"] {
  return demonstrationEmployees.some((employee) => employee.id === value);
}

export function employeeForId(id: string): DemonstrationEmployee {
  const employee = demonstrationEmployees.find((candidate) => candidate.id === id);
  if (!employee) throw new Error("Unknown employee.");
  return employee;
}
