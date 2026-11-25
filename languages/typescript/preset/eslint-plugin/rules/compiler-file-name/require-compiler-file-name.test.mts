import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-compiler-file-name.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'missingCompilerFileName' }] };
}

tester.run('require-compiler-file-name', rule, {
  valid: [
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, fileName: string) { ' +
      'return ts.transpileModule(source, { compilerOptions: {}, fileName }).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, pFileName: string) { ' +
      'return ts.transpileModule(source, { compilerOptions: {}, fileName: pFileName }).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function evalRepl(source: string) { ' +
      'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, fileName: string, options: ts.TranspileOptions) { ' +
      'return ts.transpileModule(source, options).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, fileName: string, options: ts.TranspileOptions) { ' +
      'return ts.transpileModule(source, { ...options, compilerOptions: {} }).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, fileName: string, options: ts.TranspileOptions) { ' +
      'return ts.transpileModule(source, { fileName: "fallback.ts", ...options }).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(args: [string, ts.TranspileOptions], fileName: string) { ' +
      'return ts.transpileModule(...args).outputText; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, fileName: string) { ' +
      'return ts.transpile(source, {}, fileName); }',
    'import * as ts from "typescript"; ' +
      'export function evalRepl(source: string) { return ts.transpile(source, {}); }',
    'import * as ts from "typescript"; ' +
      'export function parse(source: string, fileName: string) { ' +
      'return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest); }',
    'import * as ts from "typescript"; ' +
      'export function parseSnippet(source: string) { ' +
      'return ts.createSourceFile("snippet.ts", source, ts.ScriptTarget.Latest); }',
    'import * as ts from "typescript"; ' +
      'export function parseSnippet(source: string) { ' +
      'const sourceFile = ts.createSourceFile("snippet.ts", source, ts.ScriptTarget.Latest); ' +
      'return sourceFile; }',
    'import * as ts from "typescript"; ' +
      'export function parseLs(snapshot: ts.IScriptSnapshot, fileName: string) { ' +
      'return ts.createLanguageServiceSourceFile(fileName, snapshot, ts.ScriptTarget.Latest, "1", false); }',
    'import * as ts from "typescript"; ' +
      'export function parseLsSnippet(snapshot: ts.IScriptSnapshot) { ' +
      'return ts.createLanguageServiceSourceFile("temp.ts", snapshot, ts.ScriptTarget.Latest, "1", false); }',
    'export function compile(source: string, fileName: string) { ' +
      'return other.transpileModule(source, { compilerOptions: {} }); }',
    'import * as ts from "typescript"; ' +
      'const filePath = "a.ts"; ' +
      'export const out = ts.transpileModule("const x = 1;", { compilerOptions: {} });',
    'import path from "node:path"; ' +
      'import * as ts from "typescript"; ' +
      'export function evalRepl(source: string) { ' +
      'void path; return ts.transpileModule(source, { compilerOptions: {} }); }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string, profile: string, fileContent: string, files: string[], name: string) { ' +
      'void [profile, fileContent, files, name]; ' +
      'return ts.transpileModule(source, { compilerOptions: {} }); }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string) { ' +
      'const result = ts.transpileModule(source, { compilerOptions: {} }); ' +
      'const filePath = computePath(); void filePath; return result; }',
    'import * as ts from "typescript"; ' +
      'export function compile(source: string) { ' +
      '{ const filePath = computePath(); void filePath; } ' +
      'return ts.transpileModule(source, { compilerOptions: {} }); }',
    'import * as ts from "typescript"; ' +
      'export function parse(source: string, dir: string, filePath: string) { ' +
      'void filePath; return ts.createSourceFile(`${dir}/entry.ts`, source, ts.ScriptTarget.Latest); }',
  ],
  invalid: [
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {}, fileName: "module.ts" }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {}, fileName: `module.ts` }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {}, fileName: undefined }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string, base: ts.TranspileOptions) { ' +
        'return ts.transpileModule(source, { ...base, fileName: "module.ts" }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, filePath: string) { ' +
        'return ts.transpileModule(source).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, filePath: string) { ' +
        'return ts.transpileModule(source, undefined).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpile(source, {}); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpile(source, {}, undefined); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'return ts.transpile(source, {}, "module.ts"); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function parse(source: string, filePath: string) { ' +
        'return ts.createSourceFile("temp.ts", source, ts.ScriptTarget.Latest); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function parse(source: string, file: string) { ' +
        'return ts.createSourceFile("", source, ts.ScriptTarget.Latest); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function parse(snapshot: ts.IScriptSnapshot, path: string) { ' +
        'return ts.createLanguageServiceSourceFile("temp.ts", snapshot, ts.ScriptTarget.Latest, "1", false); }',
    ),
    flagged(
      'import ts from "typescript"; ' +
        'export function compile(source: string, filename: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import { transpileModule } from "typescript"; ' +
        'export function compile(source: string, pFileName: string) { ' +
        'return transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import { createSourceFile as parseSource } from "typescript"; ' +
        'export function parse(source: string, _pFileName: string) { ' +
        'return parseSource("temp.ts", source, 99); }',
    ),
    flagged(
      'const ts = require("typescript"); ' +
        'export function compile(source: string, _filePath: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile({ source, fileName }: { source: string; fileName: string }) { ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile({ target: inputPath }: { target: string }, source: string) { ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, id: string) { ' +
        'const sourceFile = resolveFile(id); void sourceFile; ' +
        'return ts.transpileModule(source, { compilerOptions: {} }).outputText; }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compileAll(files: string[], source: string) { ' +
        'for (const filePath of files) { void filePath; ts.transpileModule(source, { compilerOptions: {} }); } }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export function compile(source: string, fileName: string) { ' +
        'const run = () => ts.transpileModule(source, { compilerOptions: {} }).outputText; return run(); }',
    ),
    flagged(
      'import * as ts from "typescript"; ' +
        'export class Compiler { constructor(private fileName: string) { ' +
        'ts.transpileModule("const x = 1;", { compilerOptions: {} }); } }',
    ),
  ],
});
