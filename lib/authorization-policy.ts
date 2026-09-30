export type PolicyRole = "manager" | "salesperson" | "expense_reporter";
export type Capability = "submit_sale" | "submit_expense" | "review_decisions" | "view_all_records";

const capabilityRoles: Record<Capability, readonly PolicyRole[]> = {
  submit_sale: ["salesperson"],
  submit_expense: ["expense_reporter"],
  review_decisions: ["manager"],
  view_all_records: ["manager"],
};

export function canPerform(role: PolicyRole | undefined, capability: Capability) {
  return Boolean(role && capabilityRoles[capability].includes(role));
}
