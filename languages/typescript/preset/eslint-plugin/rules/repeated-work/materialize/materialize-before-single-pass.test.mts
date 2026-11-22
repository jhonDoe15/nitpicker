import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './materialize-before-single-pass.mts';

const tester = typescriptRuleTester();

const MATERIALIZE = { messageId: 'materializeBeforeSinglePass' };
const DECLARES = `
declare function writePieces(items: Iterable<string>): void;
declare function writeLines(items: Iterable<string>): void;
declare function writeJsonLines(items: Iterable<unknown>): void;
declare function streamJson(items: Iterable<unknown>): void;
declare function format(item: string): string;
declare function keep(item: string): boolean;
declare function expand(item: string): string[];
declare function emit(text: string): void;
`;

tester.run('materialize-before-single-pass', rule, {
  valid: [
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { writePieces(findings.slice(0, 10).map(format)); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f() { writeLines(['a', 'b'].map(format)); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { const mapped = findings.map(format); console.log(mapped.length); writeLines(mapped); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { const mapped = findings.map(format); mapped.sort(); writeLines(mapped); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { const mapped = findings.map(format); console.log(mapped[0]); writeLines(mapped); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { const mapped = findings.map(format); writeLines(mapped); writePieces(mapped); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { const mapped = findings.map(format); return mapped; }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function consumeTwice(items: string[]) { for (const x of items) emit(x); for (const y of items) emit(y); } export function f(findings: string[]) { consumeTwice(findings.map(format)); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function needsLength(items: string[]) { emit(String(items.length)); for (const x of items) emit(x); } export function f(findings: string[]) { needsLength(findings.map(format)); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function returnsItems(items: string[]) { return items; } export function f(findings: string[]) { returnsItems(findings.map(format)); }`,
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function* mapped(findings: string[]) { for (const f of findings) yield format(f); } export function f(findings: string[]) { writePieces(mapped(findings)); }`,
    },
    {
      filename: 'src/report.test.mts',
      code: `${DECLARES}export function f(findings: string[]) { writePieces(findings.map(format)); }`,
    },
  ],
  invalid: [
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(findings: string[]) { writePieces(findings.map(format)); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(results: string[]) { writeLines(results.filter(keep)); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(rows: string[]) { writeJsonLines(rows.flatMap(expand)); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(entries: Set<string>) { streamJson([...entries]); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function* json(items: Iterable<string>) { for (const item of items) { yield JSON.stringify(item); } } export function f(findings: string[]) { json(findings.map(format)); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function emitAll(items: Iterable<string>) { for (const item of items) { emit(item); } } export function f(files: string[]) { emitAll(files.filter(keep).map(format)); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}export function f(records: string[]) { const lines = records.map(format); writeLines(lines); }`,
      errors: [MATERIALIZE],
    },
    {
      filename: 'src/report.mts',
      code: `${DECLARES}function* passthrough(items: Iterable<string>) { yield* items; } export function f(items: string[]) { passthrough([...items]); }`,
      errors: [MATERIALIZE],
    },
  ],
});
