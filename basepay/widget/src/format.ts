/** Shortens an address for display without hiding the parts people check. */
export function truncateAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function truncateHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** "4:32" / "12:05". Clamped at zero so an expired session never counts up. */
export function formatCountdown(millisRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(millisRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Trims trailing zeros past two decimals: 45.000000 -> 45.00, 45.001230 -> 45.00123 */
export function trimUsdc(amount: string): string {
  if (!amount.includes('.')) return amount;
  const trimmed = amount.replace(/0+$/, '');
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
