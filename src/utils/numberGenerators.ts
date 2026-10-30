/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper to generate random 13-digit string with 'T' prefix.
 */
export function generateRandomInvoiceNumber(): string {
  const digits = Array.from({ length: 13 }, () => Math.floor(Math.random() * 10)).join('');
  return `T${digits}`;
}

/**
 * Helper to generate random 8-digit date string formatted strictly as YYYYMMDD.
 */
export function generateRandomDateNumber(): string {
  const year = 2024 + Math.floor(Math.random() * 3); // 2024-2026
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Helper to generate random Japanese phone number (10 or 11 digits).
 */
export function generateRandomPhoneNumber(): string {
  const prefixes = ['03', '06', '045', '052', '092', '011', '090', '080', '070'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const remainingDigitsCount = (prefix.startsWith('090') || prefix.startsWith('080') || prefix.startsWith('070')) ? 8 : (10 - prefix.length);
  const remaining = Array.from({ length: remainingDigitsCount }, () => Math.floor(Math.random() * 10)).join('');
  return `${prefix}${remaining}`;
}
