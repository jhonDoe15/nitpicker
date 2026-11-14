import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT as untypedPackageRoot } from './tooling/tool-resolution.mjs';

const root: string = untypedPackageRoot;
const SHIPPED_FOLDERS = ['core', 'shared', 'languages'];
const UNSHIPPED_FOLDERS = new Set(['node_modules', 'fixtures', 'test-support', '__tests__']);
const SOURCE_FILE = /\.(?:mjs|mts|cjs|js)$/u;
const PACKAGE_FILE = /['"`][^'"`]*\b(?:package\.json|package-lock\.json|CHANGELOG\.md)['"`]/u;

type NamedBody = readonly [string, string];

function shippedModules(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return UNSHIPPED_FOLDERS.has(entry.name) ? [] : shippedModules(relative);
    }
    return SOURCE_FILE.test(entry.name) && !entry.name.includes('.test.') ? [relative] : [];
  });
}

function localFunctions(source: ts.SourceFile): NamedBody[] {
  return source.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      return [[statement.name.text, statement.getText(source)]];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap(({ name, initializer }): NamedBody[] =>
      ts.isIdentifier(name) && initializer !== undefined && isFunction(initializer)
        ? [[name.text, initializer.getText(source)]]
        : [],
    );
  });
}

function isFunction(node: ts.Node | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function withReadersAmong(
  functions: readonly NamedBody[],
  readers: ReadonlySet<string>,
): ReadonlySet<string> {
  const calls = (body: string) =>
    [...readers].some((reader) => new RegExp(`\\b${reader}\\(`, 'u').test(body));
  const added = functions
    .filter(([name, body]) => !readers.has(name) && (PACKAGE_FILE.test(body) || calls(body)))
    .map(([name]) => name);
  return added.length === 0
    ? readers
    : withReadersAmong(functions, new Set([...readers, ...added]));
}

function packageReaders(source: ts.SourceFile): ReadonlySet<string> {
  return withReadersAmong(localFunctions(source), new Set());
}

function readsPackageFile(
  node: ts.CallExpression,
  source: ts.SourceFile,
  readers: ReadonlySet<string>,
): boolean {
  const callee = node.expression;
  return (
    PACKAGE_FILE.test(node.getText(source)) || (ts.isIdentifier(callee) && readers.has(callee.text))
  );
}

function isEntryPointGuard(node: ts.Node, source: ts.SourceFile): boolean {
  const condition = ts.isIfStatement(node) ? node.expression.getText(source) : '';
  return /\bimport\.meta\.(?:url|filename)\b/u.test(condition);
}

function importTimePackageReads(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const readers = packageReaders(source);
  const reads: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node) || isEntryPointGuard(node, source)) {
      return;
    }
    if (ts.isCallExpression(node) && readsPackageFile(node, source, readers)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      reads.push(`${file}:${String(line + 1)}`);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return reads;
}

describe('the shipped modules', () => {
  it('read no package file when they are imported, so a partial copy of the package still loads', () => {
    const modules = SHIPPED_FOLDERS.flatMap(shippedModules);
    const reads = modules.flatMap((file) =>
      importTimePackageReads(file, readFileSync(path.join(root, file), 'utf8')),
    );

    expect(modules.length).toBeGreaterThan(500);
    expect(reads).toEqual([]);
  });

  it('count a read at module scope and leave reads inside functions and entry-point guards alone', () => {
    const sample = [
      "const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));",
      "const notes = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');",
      "const FILE = new URL('../package.json', import.meta.url);",
      "export function version() { return JSON.parse(readFileSync(FILE, 'utf8')).version; }",
      "const lazy = () => readFileSync(path.join(ROOT, 'package-lock.json'));",
      "function manifestOf() { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url))); }",
      'function repositoryOf() { return manifestOf().repository; }',
      'const REPOSITORY = repositoryOf();',
      'if (realpathSync(invokedPath) === import.meta.filename) { console.log(repositoryOf()); }',
      'if (repositoryOf()) { console.log(notes); }',
    ].join('\n');

    expect(importTimePackageReads('sample.mjs', sample)).toEqual([
      'sample.mjs:1',
      'sample.mjs:2',
      'sample.mjs:8',
      'sample.mjs:10',
    ]);
  });
});
