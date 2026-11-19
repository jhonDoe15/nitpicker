import path from 'node:path';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import type TypeScript from 'typescript';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mjs';
import { scriptKindOf as untypedScriptKindOf } from '../../../../modules/module-sources.mjs';
import { ts } from '../../typed/typescript-views.mts';
import { readTextFile } from './file-reads.mts';
import { projectSourceFiles } from './package-facts.mts';

type Resolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;
const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;

const listMethods = new Set(['map', 'flatMap']);
const equalityOperators = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);
const verdicts = new Map<string, boolean>();

type Target = {
  readonly file: string;
  readonly target: string;
  readonly exportName: string;
};
type ListState = { readonly listed: boolean; readonly dispatched: boolean };

function importedNames(statement: TypeScript.ImportDeclaration, exportName: string): string[] {
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  const defaultName =
    exportName === 'default' && clause?.name !== undefined ? [clause.name.text] : [];
  const namedNames =
    named !== undefined && ts.isNamedImports(named)
      ? named.elements
          .filter((element) => (element.propertyName ?? element.name).text === exportName)
          .map((element) => element.name.text)
      : [];
  return [...defaultName, ...namedNames];
}

function localNames(sourceFile: TypeScript.SourceFile, { file, target, exportName }: Target) {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier))) {
      continue;
    }
    const resolved = resolveModuleSpecifier(statement.moduleSpecifier.text, file);
    if (resolved.kind === 'file' && resolved.path === target) {
      for (const name of importedNames(statement, exportName)) {
        names.add(name);
      }
    }
  }
  return names;
}

function isListCallback(node: TypeScript.Node): boolean {
  if (ts.isSourceFile(node)) {
    return false;
  }
  const call = node.parent;
  if (!(ts.isCallExpression(call) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)))) {
    return false;
  }
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  return (
    (listMethods.has(callee.name.text) && call.arguments[0] === node) ||
    (callee.name.text === 'from' &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'Array' &&
      call.arguments[1] === node)
  );
}

function testsEquality(test: TypeScript.Expression): boolean {
  const pending = [test];
  for (const current of pending) {
    if (ts.isParenthesizedExpression(current)) {
      pending.push(current.expression);
    } else if (ts.isBinaryExpression(current)) {
      if (equalityOperators.has(current.operatorToken.kind)) {
        return true;
      }
      pending.push(current.left, current.right);
    }
  }
  return false;
}

function isDispatchBranch(node: TypeScript.Node): boolean {
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) {
    return true;
  }
  return (
    (ts.isIfStatement(node) || ts.isConditionalExpression(node)) &&
    testsEquality(ts.isIfStatement(node) ? node.expression : node.condition)
  );
}

function rendersInList(sourceFile: TypeScript.SourceFile, names: ReadonlySet<string>): boolean {
  let found = false;
  function visit(node: TypeScript.Node, state: ListState): void {
    const tag =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node.tagName : undefined;
    const rendered = tag !== undefined && ts.isIdentifier(tag) && names.has(tag.text);
    found ||= state.listed && !state.dispatched && rendered;
    const next: ListState = isListCallback(node)
      ? { listed: true, dispatched: false }
      : { listed: state.listed, dispatched: state.dispatched || isDispatchBranch(node) };
    if (!found) {
      ts.forEachChild(node, (child) => {
        visit(child, next);
      });
    }
  }
  visit(sourceFile, { listed: false, dispatched: false });
  return found;
}

function renderedIn(site: Target, text: string): boolean {
  const sourceFile = ts.createSourceFile(
    site.file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(site.file),
  );
  const names = localNames(sourceFile, site);
  return names.size > 0 && rendersInList(sourceFile, names);
}

function renderedInFile(site: Target, regexp: RegExp, stem: string): boolean {
  const read = readTextFile(site.file);
  return (
    read.kind === 'read' &&
    site.file !== site.target &&
    read.text.includes(stem) &&
    regexp.test(read.text) &&
    renderedIn(site, read.text)
  );
}

export function renderedPerItemElsewhere(target: string, exportName: string): boolean {
  return cachedValue(verdicts, `${target}\0${exportName}`, () => {
    const stem = path.basename(target).replace(/\.[^.]+$/u, '');
    return projectSourceFiles(target).some((file) =>
      renderedInFile({ file, target, exportName }, /\b(?:map|flatMap|from)\s*\(/u, stem),
    );
  });
}
