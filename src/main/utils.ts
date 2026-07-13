export function formatCost(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(6)}`
}
