import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-replacing-collection-merge.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const MERGE = (call: string, target: string) => ({
  messageId: 'replacingMerge',
  data: { call, target },
});

const EXPECTED = [
  [MERGE('all.set', 'all')],
  [MERGE('all.set', 'all')],
  [MERGE('Object.assign', 'all')],
];

tester.run('no-replacing-collection-merge', rule, {
  valid: cases(`
export function f(parts: Map<string, string[]>[]) { const all = new Map<string, string[]>(); for (const part of parts) for (const [key, values] of part) { const e = all.get(key); if (e) e.push(...values); else all.set(key, values); } return all; }

export function f(parts: Map<string, string[]>[]) { const all = new Map<string, string[]>(); for (const part of parts) for (const [key, values] of part) { if (all.has(key)) continue; all.set(key, values); } return all; }

export function f(parts: Map<string, Set<string>>[]) { const all = new Map<string, Set<string>>(); for (const part of parts) for (const [key, values] of part) { const kept = all.get(key); if (kept) for (const v of values) kept.add(v); else all.set(key, new Set(values)); } return all; }

export function f(part: Map<string, Set<string>>) { const all = new Map<string, Set<string>>(); for (const [key, values] of part) all.set(key, values); return all; }

export function f(parts: Map<string, number>[]) { const all = new Map<string, number>(); for (const part of parts) for (const [key, value] of part) all.set(key, value); return all; }

export function f(parts: Map<string, Set<string>>[]) { for (const part of parts) { const all = new Map<string, Set<string>>(); for (const [key, values] of part) all.set(key, values); use(all); } }
declare function use(x: unknown): void;

export function f(parts: Record<string, string>[]) { const all: Record<string, string> = {}; for (const part of parts) Object.assign(all, part); return all; }

export function f(parts: Record<string, string[]>[]) { const all: Record<string, string[]> = {}; for (const part of parts) Object.assign(all, { a: part.a }); return all; }
`),
  invalid: cases(`
export function f(parts: Map<string, Set<string>>[]) { const all = new Map<string, Set<string>>(); for (const part of parts) for (const [key, values] of part) all.set(key, values); return all; }

export function f(parts: Map<string, string[]>[]) { const all: Map<string, readonly string[]> = new Map(); parts.forEach((part) => part.forEach((values, key) => all.set(key, values))); return all; }

export function f(parts: Record<string, string[]>[]) { const all: Record<string, string[]> = {}; for (const part of parts) Object.assign(all, part); return all; }
`).map((code, index) => ({ code, errors: EXPECTED[index] ?? [] })),
});
