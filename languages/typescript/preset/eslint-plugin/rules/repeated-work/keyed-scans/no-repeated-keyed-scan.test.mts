import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-repeated-keyed-scan.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const SCAN = (scan: string, key: string) => ({ messageId: 'scanPerKey', data: { scan, key } });

tester.run('no-repeated-keyed-scan', rule, {
  valid: cases(`
export function f(xs: Row[], byKey: Map<string, string[]>) { const seen = new Set<string>(); for (const x of xs) { if (byKey.get(x.key)?.some((s) => seen.has(s))) continue; seen.add(x.id); } }

export function f(xs: Row[], byRow: Map<Row, string[]>) { for (const x of xs) { if (byRow.get(x)?.some((s) => s === "a")) use(x); } }
declare function use(x: Row): void;

export function f(byField: Map<string, Store[]>) { for (const field of byField.keys()) { if (byField.get(field)?.some((s) => s.changeable)) report(field); } }
declare function report(f: string): void;

export function f(byField: Map<string, Store[]>, fields: string[]) { for (const field of new Set(fields)) { if (byField.get(field)?.some((s) => s.changeable)) report(field); } }
declare function report(f: string): void;

export function f(items: Item[], groups: Map<string, Item[]>) { for (const item of items) { const g = groups.get(item.key) ?? []; if (g.some((x) => x.done)) continue; g.push(item); groups.set(item.key, g); } }

export function f(items: Item[], byKey: Map<string, Item[]>) { let limit = 0; for (const item of items) { limit += 1; if (byKey.get(item.key)?.some((x) => x.size > limit)) report(item); } }
declare function report(i: Item): void;

export function f(findings: Finding[], byField: Map<string, Store[]>) { for (const finding of findings) { const stores = byField.get(finding.field) ?? []; if (stores.some((s) => s.line > finding.line)) report(finding); } }
declare function report(f: Finding): void;

export function f(findings: Finding[], byField: Map<string, Store[]>, field: string) { for (const finding of findings) { const stores = byField.get(field) ?? []; if (stores.some((s) => s.changeable)) report(finding); } }
declare function report(f: Finding): void;

export function f(byField: Map<string, Store[]>, finding: Finding) { const stores = byField.get(finding.field) ?? []; return stores.some((s) => s.changeable); }

export function f(findings: Finding[]) { for (const finding of findings) { const byField = index(finding); if (byField.get(finding.field)?.some((s) => s.changeable)) report(finding); } }
declare function index(f: Finding): Map<string, Store[]>;
declare function report(f: Finding): void;

export function f(findings: Finding[], stores: Store[]) { for (const finding of findings) { if (stores.some((s) => s.changeable)) report(finding); } }
declare function report(f: Finding): void;
`),
  invalid: [
    {
      code: 'export function f(findings: Finding[], byField: Map<string, Store[]>) { for (const finding of findings) { const stores = byField.get(finding.field) ?? []; if (stores.some((s) => s.changeable)) report(finding); } }\ndeclare function report(f: Finding): void;',
      errors: [SCAN('stores.some', 'finding.field')],
    },
    {
      code: 'export function f(findings: Finding[], byField: Map<string, Store[]>) { return findings.filter((finding) => byField.get(finding.field)?.every((s) => !s.changeable) ?? true); }',
      errors: [SCAN('byField.get(finding.field)?.every', 'finding.field')],
    },
  ],
});
