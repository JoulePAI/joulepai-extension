/**
 * Formatting utilities for the JoulePAI extension.
 */

import { JOULES_PER_USD } from './constants.js';

/**
 * Format joule balance with commas.
 * 146750 → "146,750"
 */
export function formatJoules(amount) {
  if (amount == null) return '—';
  return Number(amount).toLocaleString('en-US');
}

/**
 * Compact format for large numbers.
 * 100000000000000 → "100T"
 * 1500000 → "1.5M"
 */
export function formatJoulesCompact(amount) {
  const n = Number(amount);
  if (n >= 1e15) return (n / 1e15).toFixed(1).replace(/\.0$/, '') + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4)  return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return formatJoules(amount);
}

/**
 * Convert joules to USD string.
 * 146750, 1000 → "$146.75"
 */
export function joulesToUsd(joules, rate = JOULES_PER_USD) {
  const usd = Number(joules) / rate;
  return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a timestamp for display.
 */
export function formatTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Truncate a UUID for display.
 * "a0000001-0000-4000-a000-000000000001" → "a000…0001"
 */
export function truncateId(id) {
  if (!id || id.length < 12) return id || '';
  return id.slice(0, 4) + '…' + id.slice(-4);
}

/**
 * Truncate on-chain tx hash.
 * "b8f7b48e0336..." → "b8f7b4…7507f5"
 */
export function truncateTx(txid) {
  if (!txid || txid.length < 16) return txid || '';
  return txid.slice(0, 6) + '…' + txid.slice(-6);
}
