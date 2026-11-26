import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-mapped-copy-for-single-pass.mts';

const tester = typescriptRuleTester();
const WRITER = `function writeLines(out, items) { for (const item of items) out.write(\`\${JSON.stringify(item)}\\n\`); }`;
const PIECES = 'function* pieces(items) { yield "["; yield* items; yield "]"; }';

function invalid(code: string) {
  return { code, errors: [{ messageId: 'copyForOnePass' }] };
}

tester.run('no-mapped-copy-for-single-pass', rule, {
  valid: [
    `${WRITER} export function f(out, findings) { writeLines(out, findings); }`,
    `${WRITER} export function f(out, findings) { writeLines(out, findings.slice(0, 10).map(toIssue)); }`,
    `${WRITER} export function f(out) { writeLines(out, [1, 2, 3].map(String)); }`,
    `export function f(out, findings) { const issues = findings.map(toIssue); issues.sort(byPath); write(out, issues); }`,
    'function twice(items) { for (const a of items) use(a); return items.length; } export const f = (findings) => twice(findings.map(g));',
    'function keep(items) { return items; } export const f = (findings) => keep(findings.map(g));',
    `${WRITER} export function f(out, summary) { writeLines(out, summary.parts.map(g)); }`,
    'export const f = (out, findings) => imported(findings.map(g));',
    'function w(items) { for (const a of xs) for (const i of items) use(a, i); } export const f = (findings) => w(findings.map(g));',
    'function w(items) { xs.forEach(() => { for (const i of items) use(i); }); } export const f = (findings) => w(findings.map(g));',
  ],
  invalid: [
    invalid(
      `${WRITER} export function f(out, findings) { writeLines(out, findings.map(toIssue)); }`,
    ),
    invalid(
      `${WRITER} export function f(out, report) { writeLines(out, report.findings.filter(isEnforceable)); }`,
    ),
    invalid(`${PIECES} export const f = (results) => pieces(results.flatMap((r) => r.items));`),
    invalid(`${PIECES} export const f = (rows) => pieces([...rows]);`),
    invalid(
      "import { Readable } from 'node:stream'; const toStream = (items) => Readable.from(items); export const f = (rows) => toStream(rows.map(g));",
    ),
  ],
});
