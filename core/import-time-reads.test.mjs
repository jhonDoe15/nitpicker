import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const root = PACKAGE_ROOT;
const SHIPPED_FOLDERS = ['core', 'shared', 'languages'];
const UNSHIPPED_FOLDERS = new Set(['node_modules', 'fixtures', 'test-support', '__tests__']);
const SOURCE_FILE = /\.(?:mjs|cjs|js)$/u;
const PACKAGE_FILE = /['"`][^'"`]*\b(?:package\.json|package-lock\.json|CHANGELOG\.md)['"`]/u;

function shippedModules(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return UNSHIPPED_FOLDERS.has(entry.name) ? [] : shippedModules(relative);
    }
    return SOURCE_FILE.test(entry.name) && !entry.name.includes('.test.') ? [relative] : [];
  });
}

function localFunctions(source) {
  return source.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      return [[statement.name.text, statement.getText(source)]];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations
      .filter(({ name, initializer }) => ts.isIdentifier(name) && isFunction(initializer))
      .map(({ name, initializer }) => [name.text, initializer.getText(source)]);
  });
}

function isFunction(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function withReadersAmong(functions, readers) {
  const calls = (body) =>
    [...readers].some((reader) => new RegExp(`\\b${reader}\\(`, 'u').test(body));
  const added = functions
    .filter(([name, body]) => !readers.has(name) && (PACKAGE_FILE.test(body) || calls(body)))
    .map(([name]) => name);
  return added.length === 0
    ? readers
    : withReadersAmong(functions, new Set([...readers, ...added]));
}

function packageReaders(source) {
  return withReadersAmong(localFunctions(source), new Set());
}

function readsPackageFile(node, source, readers) {
  const callee = node.expression;
  return (
    PACKAGE_FILE.test(node.getText(source)) || (ts.isIdentifier(callee) && readers.has(callee.text))
  );
}

function isEntryPointGuard(node, source) {
  const condition = ts.isIfStatement(node) ? node.expression.getText(source) : '';
  return /\bimport\.meta\.(?:url|filename)\b/u.test(condition);
}

function importTimePackageReads(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const readers = packageReaders(source);
  const reads = [];
  const visit = (node) => {
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
