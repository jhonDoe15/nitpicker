import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-overlapping-typescript-programs.mts';

const tester = typescriptRuleTester();
const TS = "import ts from 'typescript';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'overlappingPrograms' }] };
}

tester.run('no-overlapping-typescript-programs', rule, {
  valid: [
    `${TS} export function f(a, b, o) { const program = ts.createProgram(a, o); const unused = findUnused(program); const second = ts.createProgram(b, o); return { unused, facts: readFacts(second) }; }`,
    `${TS} export function f(a, o) { const program = ts.createProgram(a, o); return program.getSourceFiles().length; }`,
    `${TS} function one(a, o) { const p = ts.createProgram(a, o); return count(p); } function two(b, o) { const p = ts.createProgram(b, o); return count(p); } export const f = (a, b, o) => [one(a, o), two(b, o)];`,
    "import { createProgram } from 'other'; export function f(a, b) { const p = createProgram(a); const q = createProgram(b); return [p, q]; }",
    `${TS} export function f(a, b, o) { const checker = ts.createProgram(a, o).getTypeChecker(); use(checker); const second = ts.createProgram(b, o); return second; }`,
    `${TS} export function f(a, o) { let p = ts.createProgram(a, o); p = ts.createProgram(a, o, undefined, p); return p; }`,
    `${TS} export function f(a, b, o) { let p = ts.createProgram(a, o); use(p); p = ts.createProgram(b, o); return p; }`,
    `${TS} export function f(a, b, o) { let p = ts.createProgram(a, o); use(p); const q = ts.createProgram(b, o); p = undefined; return q; }`,
    `${TS} export function f(a, o) { const p = ts['createProgram'](a, o); const q = ts['createProgram'](a, o); return [p, q]; }`,
    'import { "createProgram" as make } from \'typescript\'; export function f(a, b) { const p = make(a); const q = make(b); return [p, q]; }',
    `${TS} export function f(a, b, o) { const program = ts.createProgram(a, o); report(program.getTypeChecker()); const second = ts.createProgram(b, o); return second; }`,
  ],
  invalid: [
    invalid(
      `${TS} const first = ts.createProgram(a, o); const second = ts.createProgram(b, o); use(first, second);`,
    ),
    invalid(
      `${TS} export function f(roots, otherRoots, options) { const program = ts.createProgram(roots, options); const unused = findUnused(program); const second = ts.createProgram(otherRoots, options); const facts = readFacts(second); return { unused, facts, files: program.getSourceFiles().length }; }`,
    ),
    invalid(
      "import { createProgram } from 'typescript'; export function f(a, b, o) { const program = createProgram(a, o); const checker = program.getTypeChecker(); const service = createProgram(b, o); return [checker.getTypeAtLocation(x), service]; }",
    ),
    invalid(
      "import * as ts from 'typescript'; export function f(a, b, o, host) { const first = ts.createLanguageService(host); const second = ts.createProgram(b, o); return [first.getProgram(), second]; }",
    ),
  ],
});
