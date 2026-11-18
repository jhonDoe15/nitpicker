import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-inconsistent-comparator.mts';

const tester = typescriptRuleTester();

function never(code: string) {
  return { code, errors: [{ messageId: 'neverEqual' }] };
}

function asymmetric(code: string) {
  return { code, errors: [{ messageId: 'asymmetric' }] };
}

tester.run('no-inconsistent-comparator', rule, {
  valid: [
    'items.sort((a, b) => b.priority - a.priority);',
    'items.sort((a, b) => a.name.localeCompare(b.name));',
    'items.sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));',
    'items.sort((a, b) => { if (a.x < b.x) return -1; if (a.x > b.x) return 1; return 0; });',
    'items.sort((a, b) => (a.x === b.x ? 0 : a.x < b.x ? -1 : 1));',
    'items.sort((a, b) => (a.x < b.x ? -1 : compare(a.y, b.y)));',
    'items.toSorted((a, b) => Number(a.x) - Number(b.x));',
    'items.sort();',
    'items.sort(byName);',
    'function byName(a, b) { return a.n.localeCompare(b.n); } items.sort(byName);',
    'items.sort((a, b) => 1);',
    'items.sort(() => (flag ? 1 : -1));',
    'items.sort((a, b) => { log(a); });',
    'rows.sort((a, b) => (a.v == null ? 1 : b.v == null ? -1 : a.v - b.v) * direction);',
    'rows.sort((a, b) => (a.v == null && b.v == null ? 0 : cmp(a.v, b.v)));',
    'rows.sort((a, b) => (a.v == null || b.v == null ? 0 : a.v - b.v));',
    'rows.sort((a, b) => (a.v == null ? direction : b.v == null ? -direction : a.v - b.v));',
    'rows.sort((a, b) => (a.v == null || a.w == null ? direction : a.v - b.v));',
    'rows.sort((a, b) => (a.v == null || b.v == null ? a.v ?? 1 : a.v - b.v));',
    'rows.sort((a, b, c) => (a.v < b.v ? 1 : -1));',
    'sorter.sort((a, b) => (a.v < b.v ? 1 : -1), extra);',
    'items.sort((a, b) => { const inner = () => 1; return a.v - b.v; });',
    'rows.sort((a, b) => (a.v && b.v ? a.v - b.v : 0));',
    'rows.sort((a, b) => (a.v && b.v ? a.v - b.v : b.v ? 1 : -1));',
    'rows.sort((a, b) => (a.v && a.w ? a.v - b.v : direction));',
    '[...new Set(ids)].sort((a, b) => (a < b ? -1 : 1));',
    'Array.from(versions.keys()).sort((a, b) => (gt(a, b) ? -1 : 1));',
    'Object.keys(table).sort((a, b) => (a < b ? -1 : 1));',
    'Object.entries(data).sort((a, b) => (a[0] < b[0] ? -1 : 1));',
    'Array.from(new Set(ids)).sort((a, b) => (a < b ? -1 : 1));',
  ],
  invalid: [
    asymmetric(
      'rows.sort((a, b) => (a[key] && b[key] ? a[key].localeCompare(b[key]) * direction : direction));',
    ),
    asymmetric('rows.sort((a, b) => (a.v != null && b.v != null ? a.v - b.v : 1));'),
    never('items.sort((a, b) => (a.priority < b.priority ? 1 : -1));'),
    never('items.toSorted((a, b) => (a.x > b.x ? 1 : -1));'),
    never('items.sort(function (a, b) { return a.x > b.x ? 1 : -1; });'),
    never('items.sort((a, b) => { if (a.x < b.x) { return -1; } return 1; });'),
    never(
      'items.sort((a, b) => { if (a.x < b.x) return -1; if (a.x > b.x) return 1; return -1; });',
    ),
    never('function byX(a, b) { return a.x < b.x ? -1 : 1; } items.sort(byX);'),
    never('const byX = (a, b) => (a.x < b.x ? -1 : 1); items.sort(byX);'),
    never('items.sort((a: Item, b: Item) => (a.x < b.x ? -1 : 1) as number);'),
    asymmetric(
      'rows.sort((a, b) => (a.value == null || b.value == null ? direction : compare(a.value, b.value) * direction));',
    ),
    asymmetric('rows.sort((a, b) => (!a.v || !b.v ? 1 : a.v - b.v));'),
    asymmetric(
      'rows.sort((a, b) => { if (a.v === undefined || b.v === null) { return -direction; } return a.v - b.v; });',
    ),
    asymmetric('rows.sort((a, b) => (a.v == null || b.v == null ? -1 : a.v - b.v));'),
    never('items.sort((a, b) => (a.date < b.date ? 1 : -1));'),
    never('Object.entries(data).sort((a, b) => (a[1] < b[1] ? -1 : 1));'),
    never('[...ids].sort((a, b) => (a < b ? -1 : 1));'),
  ],
});
