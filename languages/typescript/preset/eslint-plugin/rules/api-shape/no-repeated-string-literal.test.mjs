import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-repeated-string-literal.mjs';

const tester = typescriptRuleTester();

tester.run('no-repeated-string-literal', rule, {
  valid: [
    'const a = ["pending", "pending"];',
    'const a = ["tiny", "tiny", "tiny"];',
    'const a = ["-----", "-----", "-----"];',
    'const PENDING = "pending"; const a = [PENDING, PENDING, PENDING];',
    'import a from "pending"; export { a } from "pending"; export * from "pending";',
    'import("pending"); require("pending"); import("pending");',
    'type A = "pending"; type B = "pending"; type C = "pending";',
    'const a = {"pending": 1}; const b = a["pending"]; const c = a["pending"];',
    'const a = [`pending ${a}`, `pending ${b}`, `pending ${c}`];',
    'const a = [tag`pending`, tag`pending`, tag`pending`];',
    'const a = ["pending", "pending"]; import b from "pending";',
    'import a = require("pending"); import b = require("pending"); import c = require("pending");',
    {
      filename: 'labels.tsx',
      code: 'const a = <><div title="pending"/><div title="pending"/><div title="pending"/></>;',
    },
  ],
  invalid: [
    {
      code: 'const a = [`pending`, "pending", `pending`];',
      errors: [{ messageId: 'repeated' }],
    },
    {
      code: 'const a = ["pending", "pending", "pending"];',
      errors: [{ messageId: 'repeated', column: 34 }],
    },
    {
      code: 'const a = ["pending", "pending", "pending", "pending"];',
      errors: [{ messageId: 'repeated' }, { messageId: 'repeated' }],
    },
    {
      code: 'const a = ["pending", \'pending\', "pend\\u0069ng"];',
      errors: [{ messageId: 'repeated' }],
    },
    {
      code: 'const a = "pending" as const; const b = "pending" as const; const c = "pending" as const;',
      errors: [{ messageId: 'repeated' }],
    },
    {
      code: 'const a = {key: "pending"}; const b = {key: "pending"}; const c = {key: "pending"};',
      errors: [{ messageId: 'repeated' }],
    },
    {
      code: 'const a = ["שלום-עולם", "שלום-עולם", "שלום-עולם"];',
      errors: [{ messageId: 'repeated' }],
    },
  ],
});
