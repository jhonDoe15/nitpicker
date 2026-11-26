import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-repeated-parse-per-item.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const PARSE = (call: string, field: string) => ({
  messageId: 'parsePerItem',
  data: { call, field },
});
const ONE_LINE = 'function oneLine(text: string) { return text.replace(/\\s+/gu, " ").trim(); }';
const ROUTE =
  'function splitRoute(text: string) { const [head = "", body = ""] = text.split(" | "); return { head, body }; }';
const SAVED =
  'let count = 0;\nfunction counted(text: string) { count += 1; return text.split(","); }';

tester.run('no-repeated-parse-per-item', rule, {
  valid: [
    ...cases(`
const isTs = (p: string) => /\\.tsx?$/u.test(p);
export function f(xs: Finding[]) { return xs.filter((x) => isTs(x.message)); }

function upper(text: string) { return text.toUpperCase(); }
export function f(items: Finding[]) { return items.map((item) => upper(item.message)); }

let sep = ",";
function parts(text: string) { return text.split(sep); }
export function f(items: Finding[]) { return items.map((item) => parts(item.message)); }

export function f(items: Finding[]) { return items.map((item) => parse(item.message)); }
declare function parse(text: string): string[];
`),
    `${ROUTE}\nexport function f(xs: Finding[], cache: Map<string, unknown>) { return xs.map((x) => cache.get(x.message) ?? splitRoute(x.message)); }`,
    `${ONE_LINE}\nexport function f(item: Finding) { return oneLine(item.message); }`,
    `${ONE_LINE}\nexport function f(items: Finding[]) { return items.map((item) => oneLine(item.id)); }`,
    `${ONE_LINE}\nexport function f(items: Finding[], other: Finding) { return items.map((item) => oneLine(other.message)); }`,
    `${SAVED}\nexport function f(items: Finding[]) { return items.map((item) => counted(item.message)); }`,
    `${ONE_LINE}\nexport function f() { return [{ message: "a" }].map((item) => oneLine(item.message)); }`,
    `${ONE_LINE}\nexport function f(items: Finding[]) { return items.map((item) => oneLine(item.message, 1)); }`,
  ],
  invalid: [
    {
      code: `${ONE_LINE}\n${ROUTE}\nexport function f(members: Finding[]) { return members.map((finding) => splitRoute(oneLine(finding.message))); }`,
      errors: [PARSE('splitRoute', 'message')],
    },
    {
      code: 'const parseRule = (text: string) => JSON.parse(text) as unknown;\nexport function f(rows: Row[]) { const out = []; for (const row of rows) { out.push(parseRule(row.rule)); } return out; }',
      errors: [PARSE('parseRule', 'rule')],
    },
    {
      code: `${ONE_LINE}\nexport function f(items: Finding[]) { items.forEach((item) => { print(oneLine(item.kind)); }); }\ndeclare function print(text: string): void;`,
      errors: [PARSE('oneLine', 'kind')],
    },
  ],
});
