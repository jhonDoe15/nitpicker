export const MAX_ITEMS = 50;
export const DEFAULT_REGION = 'eu-west-1' as const;
export const MIN_BALANCE = -25;
export const RETRY_LIMIT = 2;
export const SHORT = 'ab';
const PAGE_SIZE = 20;
const hidden = 77;
export { PAGE_SIZE, hidden };
export const maxDepth = 9;
export const TIMEOUT_MS = 5_000;
export const LIMITS = { MAX: 3 };
export function limit(): number {
  return MAX_ITEMS;
}
export class Paging {
  static readonly PAGE_LIMIT = 40;
  private static readonly SECRET_KEY = 'hidden-key';
  static readonly lowerName = 41;
  static PAGE_FLOOR = 42;
}
