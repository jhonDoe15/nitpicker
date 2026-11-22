import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './repeated-scan-per-key.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'repeatedScanPerKey' }] };
}

tester.run('repeated-scan-per-key', rule, {
  valid: [
    'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (const item of items) { if (byKey.get(item.group)?.some((x) => x.id === item.id)) { mark(item); } } }',
    'export function f(byKey: Map<string, Entry[]>) { for (const key of byKey.keys()) { if (byKey.get(key)?.some((x) => x.active)) { mark(key); } } }',
    'export function f(byKey: Map<string, Entry[]>) { for (const [key] of byKey.entries()) { if (byKey.get(key)?.some((x) => x.active)) { mark(key); } } }',
    'export function f(keys: string[], byKey: Map<string, Entry[]>) { for (const key of new Set(keys)) { if (byKey.get(key)?.some((x) => x.active)) { mark(key); } } }',
    'export function f(byKey: Record<string, Entry[]>) { for (const key of Object.keys(byKey)) { if (byKey[key].filter((x) => x.active).length > 0) { mark(key); } } }',
    'export function f(byKey: Map<string, Entry[]>) { for (const key of ["a", "b"]) { if (byKey.get(key)?.some((x) => x.active)) { mark(key); } } }',
    'export function f(items: Item[], byKey: Map<string, Entry[]>) { items.forEach((item) => { const list = byKey.get(item.group) ?? []; list.find((x) => x.name === item.name); }); }',
    {
      filename: 'src/scan.test.mts',
      code: 'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (const item of items) { if (byKey.get(item.group)?.some((x) => x.active)) { mark(item); } } }',
    },
    {
      filename: 'tests/scan.ts',
      code: 'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (const item of items) { if (byKey.get(item.group)?.some((x) => x.active)) { mark(item); } } }',
    },
  ],
  invalid: [
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (const item of items) { if (byKey.get(item.group)?.some((x) => x.active)) { mark(item); } } }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Record<string, Entry[]>) { for (const item of items) { const list = byKey[item.group] ?? []; if (list.every((x) => x.valid)) { mark(item); } } }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { return items.map((item) => (byKey.get(item.group) ?? []).filter((x) => x.enabled)); }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { items.forEach((item) => { const group = byKey.get(item.group); group?.find((x) => x.primary); }); }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { return items.filter((item) => (byKey.get(item.group) ?? []).some((x) => x.group === item.group)); }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (const item of items) { for (const entry of byKey.get(item.group) ?? []) { if (entry.active) { mark(item); } } } }',
    ),
    invalid(
      'export function f(items: Item[], byKey: Map<string, Entry[]>) { for (let i = 0; i < items.length; i += 1) { const item = items[i]; const list = byKey.get(item.group) ?? []; if (list.some((x) => x.active)) { mark(item); } } }',
    ),
  ],
});
