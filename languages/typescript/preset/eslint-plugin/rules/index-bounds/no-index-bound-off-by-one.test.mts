import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-index-bound-off-by-one.mts';

const ruleTester = typescriptRuleTester();

const rejects = [
  'function get(list, index) { if (index < 0 || index > list.length) { throw new ' +
    'RangeError("x"); } return list[index]; }',
  'function ok(table, c) { if (c > table.length || !table[c]) { return false; } return true; }',
  'function ok(table, c) { return c > table.length || !table[c]; }',
  'function get(list, index) { if (index > list.size) return null; return list[index]; }',
  'function get(list, index) { if (list.length < index) { return undefined; } return list[index]; }',
  'function get(list, index) { if (index > list.size()) { throw new Error("x"); } return list[index]; }',
  'class A { get(index) { if (index > this.items.length) { return null; } return this.items[index]; } }',
];

const accepts = [
  'function get(list, index) { return index <= list.length && list[index]; }',
  'function get(list, index) { if (index <= list.length) { return list[index]; } return null; }',
  'function get(list, index) { if (list.length >= index && index >= 0) { return list[index]; } }',
  'function sum(list) { let i = 0; let total = 0; while (i <= list.length) { total ' +
    '+= list[i]; i += 1; } return total; }',
  'function sum(list) { let total = 0; for (let i = 0; i <= list.length; i++) { total += list[i]; } return total; }',
];

const valid = [
  'function get(list, index) { if (index < 0 || index >= list.length) { throw new ' +
    'RangeError("x"); } return list[index]; }',
  'function ok(table, c) { return c >= table.length || !table[c]; }',
  'function insert(list, index, item) { if (index > list.length) { throw new ' +
    'RangeError("x"); } list.splice(index, 0, item); }',
  'function insert(list, index, item) { if (index < 0 || index > list.length) { return; } list[index] = item; }',
  'function sub(text, end) { if (end > text.length) { return ""; } return text.slice(0, end); }',
  'function get(list, index) { if (index > list.length) { return null; } if (index ' +
    '>= list.length) { return null; } return list[index]; }',
  'function get(list, index) { if (index > list.length) { log("x"); } return list[index]; }',
  'function get(list, index) { if (index > list.length) { return null; } return other[index]; }',
  'function get(list, index) { if (index > list.length) { return null; } index = 0; return list[index]; }',
  'function get(list, index) { if (index <= list.length) { list.push(index); } }',
  'function get(list, index) { return index < list.length && list[index]; }',
  'function put(list, index, item, replace) { if (index > list.length || (replace && ' +
    'index === list.length)) { throw new Error("x"); } return list[index]; }',
  'function sum(list) { let total = 0; for (let i = 0; i < list.length; i++) { total += list[i]; } return total; }',
  'function drain(list) { let i = 0; while (i <= list.length) { i += 1; } return i; }',
];

ruleTester.run('no-index-bound-off-by-one', rule, {
  valid: cases(valid),
  invalid: [
    ...rejects.map((code) => ({ code, errors: [{ messageId: 'rejectsTooLate' as const }] })),
    ...accepts.map((code) => ({ code, errors: [{ messageId: 'acceptsTooMuch' as const }] })),
  ],
});
