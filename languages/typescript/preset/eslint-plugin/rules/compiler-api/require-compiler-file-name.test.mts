import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-compiler-file-name.mts';

const tester = typescriptRuleTester();
const NS = "import * as ts from 'typescript';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'fixedName' }] };
}

tester.run('require-compiler-file-name', rule, {
  valid: [
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, { fileName, compilerOptions }); }`,
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, { compilerOptions, fileName: fileName.toLowerCase() }); }`,
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, options); }`,
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, { ...options }); }`,
    `${NS} export function evaluate(source) { return ts.transpileModule(source, { compilerOptions }); }`,
    `${NS} export function run(source, fileName) { return ts.transpile(source, options, fileName); }`,
    `${NS} export function run(source, fileName) { return ts.createSourceFile(fileName, source, target); }`,
    `${NS} export function parse(source) { return ts.createSourceFile('repl.ts', source, target); }`,
    `${NS} const probe = ts.createSourceFile('probe.ts', '', target); export function run(fileName) { return fileName; }`,
    `${NS} export function run(source, fileName) { return ts.createLanguageServiceSourceFile(fileName, snapshot, target, '1', false); }`,
    `import ts from 'typescript'; export function run(source, ...rest) { return ts.transpile(source, options, ...rest); }`,
    `import * as ts from 'other'; export function run(source, fileName) { return ts.transpileModule(source, {}); }`,
    `${NS} import path from 'node:path'; export function run(source) { return ts.transpileModule(source, {}); }`,
    `${NS} export function run(source) { const path = require('node:path'); return ts.transpileModule(source, {}); }`,
    `${NS} export function run(source, mode) { return ts.createSourceFile('x.ts', source, mode); }`,
    `${NS} export function run(source, ts) { return ts.transpileModule(source, {}); }`,
    `${NS} export function run(source, fileName) { const ts = makeTs(); return ts.transpileModule(source, {}); }`,
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, { ['fileName']: fileName }); }`,
    `${NS} export function run(source, fileName) { return ts.transpileModule(source, { [key]: fileName }); }`,
    `${NS} export async function run(source) { const path = await import('node:path'); return ts.transpileModule(source, {}); }`,
    `${NS} export function run(source, file: File) { return ts.transpileModule(source, {}); }`,
  ],
  invalid: [
    invalid(
      `import ts = require('typescript'); export function run(source, fileName) { return ts.transpileModule(source, {}); }`,
    ),
    invalid(
      `export function run(source, fileName) { const ts = require('typescript'); return ts.transpileModule(source, {}); }`,
    ),
    invalid(
      `const { transpileModule } = require('typescript'); export function run(source, fileName) { return transpileModule(source, {}); }`,
    ),
    invalid(
      `const ts = require('typescript'); const { transpileModule } = ts; export function run(source, fileName) { return transpileModule(source, {}); }`,
    ),
    invalid(
      `${NS} export function run(source, fileName) { return ts.transpileModule(source, { ['fileName']: 'module.ts' }); }`,
    ),
    invalid(
      `${NS} export function run(source, fileName) { return ts.transpileModule(source, { compilerOptions }); }`,
    ),
    invalid(
      `${NS} export function run(source, fileName) { return ts.transpileModule(source, { fileName: 'module.ts', compilerOptions }); }`,
    ),
    invalid(`${NS} export function run(source, filename) { return ts.transpileModule(source); }`),
    invalid(
      `${NS} export function run(source, pFileName) { return ts.transpileModule(source, {}); }`,
    ),
    invalid(
      `${NS} export function run(source, _pFileName) { return ts.transpileModule(source, {}); }`,
    ),
    invalid(
      `${NS} export function run(source, filePath) { return ts.transpile(source, options); }`,
    ),
    invalid(
      `${NS} export function run(source, file) { return ts.transpile(source, options, 'module.ts'); }`,
    ),
    invalid(
      `${NS} export function run(source, path) { return ts.createSourceFile('module.ts', source, target); }`,
    ),
    invalid(
      `${NS} export function run(source, path) { return ts.createSourceFile(\`module.ts\`, source, target); }`,
    ),
    invalid(
      `${NS} export function run(source, fileName) { return ts.createLanguageServiceSourceFile('module.ts', snapshot, target, '1', false); }`,
    ),
    invalid(
      `import { transpileModule } from 'typescript'; export function run(source, fileName) { return transpileModule(source, {}); }`,
    ),
    invalid(
      `import ts from 'typescript'; export const run = (source, fileName) => ts.transpileModule(source, {}).outputText;`,
    ),
    invalid(
      `const ts = require('typescript'); module.exports = (source, fileName) => ts.transpileModule(source, {});`,
    ),
    invalid(
      `${NS} export function run(source) { const fileName = pick(source); return ts.transpileModule(source, {}); }`,
    ),
    invalid(`${NS} export function run(file) { return () => ts.transpileModule(source, {}); }`),
  ],
});
