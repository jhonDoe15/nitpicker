import type { Failure } from './sale.js';

export const USAGE =
  'Usage: report --input <path> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--format table|csv]';

export function failureText(failure: Failure, footer: readonly string[]): string {
  return [...failure.messages.slice(0, 1), ...footer].map((line) => `${line}\n`).join('');
}
