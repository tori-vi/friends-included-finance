export const commissionPeople = ["richard", "anastasia", "jean-claude"] as const;
export type CommissionPerson = (typeof commissionPeople)[number];

export function euros(value: number | string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(value));
}

export function calculateCommission(amount: number, shares: Record<CommissionPerson, number>) {
  const poolCents = Math.round(Math.round(amount * 100) / 10); // Round money first; 10% in cents.
  validateShares(shares);
  const raw = commissionPeople.map((person) => ({ person, cents: Math.round(poolCents * Math.round(shares[person] * 100) / 10000) }));
  const difference = poolCents - raw.reduce((sum, item) => sum + item.cents, 0);
  const priority = [...commissionPeople].sort((a, b) => shares[b] - shares[a] || commissionPeople.indexOf(a) - commissionPeople.indexOf(b));
  raw.find((item) => item.person === priority[0])!.cents += difference;
  return { ...Object.fromEntries(raw.map(({ person, cents }) => [person, cents / 100])), pool: poolCents / 100 } as Record<CommissionPerson, number> & { pool: number };
}

export function parsePositiveAmount(value: FormDataEntryValue | null, label: string) {
  const amount = Number(value);
  if (!/^\d+(\.\d{1,2})?$/.test(String(value ?? '').trim()) || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) throw new Error(`${label} must be positive euros with at most two decimal places.`);
  return Math.round(amount * 100) / 100;
}

export function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export function splitFrom(formData: FormData) {
  for (const key of ['richard', 'anastasia', 'jeanClaude']) required(formData.get(key), key + ' percentage');
  const shares = {
    richard: Number(formData.get("richard")),
    anastasia: Number(formData.get("anastasia")),
    "jean-claude": Number(formData.get("jeanClaude")),
  };
  validateShares(shares);
  return shares;
}

export function validateShares(shares: Record<CommissionPerson, number>) {
  if (!commissionPeople.every(p => Number.isFinite(shares[p]) && shares[p] >= 0 && shares[p] <= 100 && Math.abs(shares[p] * 100 - Math.round(shares[p] * 100)) < 0.000001)) throw new Error('Each percentage must be 0–100 with at most two decimal places.');
  if (commissionPeople.reduce((sum, p) => sum + Math.round(shares[p] * 100), 0) !== 10000) throw new Error('Commission percentages must total exactly 100%.');
}
