import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-repeated-keyed-scan.mts';

const tester = typescriptRuleTester();

const SCAN = (scan: string, key: string) => ({ messageId: 'scanPerKey', data: { scan, key } });

tester.run('no-repeated-keyed-scan', rule, {
  valid: [
    'export function f(findings: Finding[], byField: Map<string, Store[]>) { for (const finding of findings) { const stores = byField.get(finding.field) ?? []; if (stores.some((s) => s.line > finding.line)) report(finding); } }\ndeclare function report(f: Finding): void;',
    'export function f(findings: Finding[], byField: Map<string, Store[]>, field: string) { for (const finding of findings) { const stores = byField.get(field) ?? []; if (stores.some((s) => s.changeable)) report(finding); } }\ndeclare function report(f: Finding): void;',
    'export function f(byField: Map<string, Store[]>, finding: Finding) { const stores = byField.get(finding.field) ?? []; return stores.some((s) => s.changeable); }',
    'export function f(findings: Finding[]) { for (const finding of findings) { const byField = index(finding); if (byField.get(finding.field)?.some((s) => s.changeable)) report(finding); } }\ndeclare function index(f: Finding): Map<string, Store[]>;\ndeclare function report(f: Finding): void;',
    'export function f(findings: Finding[], stores: Store[]) { for (const finding of findings) { if (stores.some((s) => s.changeable)) report(finding); } }\ndeclare function report(f: Finding): void;',
  ],
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
