import { parsePositiveAmount, required, validateShares } from './finance';

export function validateSale(input: { reference: string; customer: string; description: string; project: string; amount: number; proposed_richard_percentage: number; proposed_anastasia_percentage: number; proposed_jean_claude_percentage: number }) {
  required(input.reference, 'Reference'); required(input.customer, 'Customer'); required(input.description, 'Description');
  if (!/^S[0-9A-Za-z_-]+$/.test(input.reference)) throw new Error('Sale reference must start with S and use letters, numbers, hyphens or underscores.');
  if (!['A', 'B'].includes(input.project)) throw new Error('Choose project A or B.');
  parsePositiveAmount(String(input.amount), 'Amount');
  validateShares({richard: input.proposed_richard_percentage, anastasia: input.proposed_anastasia_percentage, 'jean-claude': input.proposed_jean_claude_percentage});
}
export function validateExpense(input: { reference: string; description: string; amount: number; category: string; proposed_allocation: string }) {
  required(input.reference, 'Reference'); required(input.description, 'Description');
  if (!/^E[0-9A-Za-z_-]+$/.test(input.reference)) throw new Error('Expense reference must start with E and use letters, numbers, hyphens or underscores.');
  parsePositiveAmount(String(input.amount), 'Amount');
  if (!['materials','travel','other'].includes(input.category)) throw new Error('Category must be Materials, Travel or Other.');
  if (!['A','B','company_overhead'].includes(input.proposed_allocation)) throw new Error('Allocation must be A, B or Company overhead.');
}
