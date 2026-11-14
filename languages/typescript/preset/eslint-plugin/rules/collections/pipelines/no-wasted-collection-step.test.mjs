import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-wasted-collection-step.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/domain/totals.ts';

function error(messageId, data) {
  return data === undefined ? { messageId } : { messageId, data };
}

tester.run('no-wasted-collection-step', rule, {
  valid: [
    'const first = items.find((item) => item.paid);',
    'const paid = items.filter((item) => item.paid); use(paid[0], paid.length);',
    'const second = items.filter((item) => item.paid)[1];',
    'const last = items.filter((item) => item.paid).at(-1);',
    'const found = items.find((item) => item.paid); use(found);',
    'const hit = items.find((item) => item.paid) ?? fallback;',
    'const any = items.some((item) => item.paid);',
    'if (items.find((item) => item.paid) === target) { run(); }',
    'const nested = items.map(split).flat(2);',
    'const flatOnly = rows.flat();',
    'const flattened = items.flatMap(split);',
    'const copy = [...items];',
    'const merged = [...first, ...second];',
    'const withExtra = [...items.map(f), extra];',
    'const unique = new Set(items);',
    'for (const item of items) { use(item); }',
    'const settings = { ...defaults, ...options };',
    'const settings = { ...(options || fallback) };',
    'const settings = { ...(options ?? { strict: true }) };',
    'const every = items.length > 0 && items.every(isPaid);',
    'const other = items.length > 0 && rows.some(isPaid);',
    'const optional = items?.length > 0 && items.some(isPaid);',
    'const bothEmpty = items.length === 0 || items.some(isPaid);',
    'async function f() { return Promise.all([load(a), load(b)]); }',
    'async function f() { return Promise.all(tasks); }',
    'const names = [...items.map((item) => item.name)];',
    'for (const item of [...items]) { items.splice(0, 1); }',
    'function* each() { yield* [...items]; }',
    'const copy = Array.from([...items], (item) => item.id);',
    "const first = $(rows).filter('.paid')[0];",
    'items.filter((item) => item.paid)[0]++;',
    'if (!Model.find({ paid: true })) { run(); }',
    'if (!_.find(items, isPaid)) { run(); }',
    'const any = load().length > 0 && load().some(isPaid);',
    'async function f() { return Promise.allSettled([load(a)]); }',
    'async function f() { return Promise.any([load(a)]); }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'async function f() { return Promise.race([load(a)]); }',
      errors: [error('singlePromise', { method: 'race', form: '`await promise`' })],
    },
    {
      code: 'const first = items.filter((item) => item.paid)[0];',
      errors: [error('filterFirst')],
    },
    {
      code: 'const first = items.filter((item) => item.paid).at(0);',
      errors: [error('filterFirst')],
    },
    {
      code: 'const paid = items.find((item) => item.paid) !== undefined;',
      errors: [error('findAsBoolean')],
    },
    {
      code: 'const paid = items.find((item) => item.paid) != null;',
      errors: [error('findAsBoolean')],
    },
    {
      code: 'const missing = !items.find((item) => item.paid);',
      errors: [error('findAsBoolean')],
    },
    {
      code: 'const paid = Boolean(items.find((item) => item.paid));',
      errors: [error('findAsBoolean')],
    },
    {
      code: 'if (items.find((item) => item.paid)) { run(); }',
      errors: [error('findAsBoolean')],
    },
    {
      code: 'const label = items.find((item) => item.paid) ? "paid" : "open";',
      errors: [error('findAsBoolean')],
    },
    { code: 'const parts = items.map(split).flat();', errors: [error('mapFlat')] },
    { code: 'const parts = items.map(split).flat(1);', errors: [error('mapFlat')] },
    {
      code: 'const keys = [...Object.keys(record)];',
      errors: [error('uselessSpread', { what: 'an array that is already new' })],
    },
    {
      code: 'const pair = [...[first, second]];',
      errors: [error('uselessSpread', { what: 'an array that is already new' })],
    },
    {
      code: 'async function f() { return [...(await Promise.all(tasks))]; }',
      errors: [error('uselessSpread', { what: 'an array that is already new' })],
    },
    {
      code: 'const unique = new Set([...items]);',
      errors: [error('uselessSpread', { what: 'an iterable that the receiver already takes' })],
    },
    {
      code: 'const copy = Array.from([...items]);',
      errors: [error('uselessSpread', { what: 'an iterable that the receiver already takes' })],
    },
    {
      code: 'async function f() { return Promise.all([...tasks]); }',
      errors: [error('uselessSpread', { what: 'an iterable that the receiver already takes' })],
    },
    {
      code: 'const settings = { ...(options || {}) };',
      errors: [error('fallbackInSpread', { operator: '||' })],
    },
    {
      code: 'const settings = { strict: true, ...(options ?? {}) };',
      errors: [error('fallbackInSpread', { operator: '??' })],
    },
    {
      code: 'const paid = items.length > 0 && items.some(isPaid);',
      errors: [error('lengthCheck', { method: 'some', answer: 'false' })],
    },
    {
      code: 'const paid = 0 !== this.items.length && this.items.some(isPaid);',
      errors: [error('lengthCheck', { method: 'some', answer: 'false' })],
    },
    {
      code: 'const done = items.length === 0 || items.every(isPaid);',
      errors: [error('lengthCheck', { method: 'every', answer: 'true' })],
    },
    {
      code: 'async function f() { return Promise.all([load(a)]); }',
      errors: [error('singlePromise', { method: 'all', form: '`[await promise]`' })],
    },
    {
      code: 'async function f() { return Promise.allSettled([await load(a), load(b)]); }',
      errors: [error('awaitInPromiseMethod', { method: 'allSettled' })],
    },
  ].map((test) => ({ filename, ...test })),
});
