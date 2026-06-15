/** USD with grouping; empty / invalid → null display handled by caller */
export function formatUsd(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (Number.isNaN(n)) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}
