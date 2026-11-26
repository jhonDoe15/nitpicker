import type TypeScript from 'typescript';
import { resolveModuleSpecifier as untypedResolve } from '../../../../../modules/module-resolution.mts';
import { cachedValue } from '../../../../../../../../shared/values/caching/cached-value.mts';
import { ts, withoutParentheses } from '../../../typed/typescript-views.mts';
import { moduleFactsOf, type ModuleFacts } from '../../module-values/module-facts.mts';
import { readTextFile } from '../../support/file-reads.mts';
import { readStamped, scriptKindOf, type StampedCache } from '../../support/typed-sources.mts';

type Resolution = { readonly kind: string; readonly path?: string };
type Parsed = { readonly facts: ModuleFacts; readonly source: TypeScript.SourceFile };
type Lookup = { readonly parsed: Parsed; readonly name: string; readonly exported: boolean };
type HookBody = TypeScript.FunctionLikeDeclaration;

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;

export const BROWSER_GLOBALS: ReadonlySet<string> = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'matchMedia',
]);
const MAX_LOOKUPS = 8;
const MAX_CHARACTERS = 1_000_000;
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken]);
const parsedFiles: StampedCache<Parsed | undefined> = new Map();
const verdicts = new WeakMap<Parsed, Map<string, { readonly test: boolean }>>();
const currentFiles = new WeakMap<object, Parsed>();

function parse(file: string, text: string): Parsed {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  return { facts: moduleFactsOf(file, text), source };
}

function parsedFile(file: string): Parsed | undefined {
  return readStamped(parsedFiles, file, (path) => {
    const read = readTextFile(path);
    return read.kind === 'read' && read.text.length <= MAX_CHARACTERS
      ? parse(path, read.text)
      : undefined;
  });
}

function typeofGlobal(node: TypeScript.Expression): boolean {
  const inner = withoutParentheses(node);
  return (
    ts.isTypeOfExpression(inner) &&
    ts.isIdentifier(inner.expression) &&
    BROWSER_GLOBALS.has(inner.expression.text)
  );
}

function isTypeofCombination(expression: TypeScript.Expression): boolean {
  const pending = [expression];
  for (const current of pending) {
    const node = withoutParentheses(current);
    const operator = ts.isBinaryExpression(node) ? node.operatorToken.kind : undefined;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      pending.push(node.operand);
    } else if (ts.isBinaryExpression(node) && operator !== undefined && LOGICAL.has(operator)) {
      pending.push(node.left, node.right);
    } else if (!(
      ts.isBinaryExpression(node) &&
      operator !== undefined &&
      EQUALITY.has(operator) &&
      (typeofGlobal(node.left) || typeofGlobal(node.right))
    )) {
      return false;
    }
  }
  return true;
}

function returnedValues(body: HookBody): (TypeScript.Expression | undefined)[] {
  if (body.body === undefined) {
    return [undefined];
  }
  if (!ts.isBlock(body.body)) {
    return [body.body];
  }
  const found: (TypeScript.Expression | undefined)[] = [];
  const pending: TypeScript.Node[] = [body.body];
  for (const node of pending) {
    if (ts.isReturnStatement(node)) {
      found.push(node.expression);
    } else if (node === body.body || !(ts.isFunctionLike(node) || ts.isClassLike(node))) {
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
  }
  return found;
}

function returnsTypeofTest(body: HookBody): boolean {
  const values = returnedValues(body);
  return (
    values.length > 0 && values.every((value) => value !== undefined && isTypeofCombination(value))
  );
}

function declaredFunction(source: TypeScript.SourceFile, name: string): HookBody | undefined {
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    const found = declarations.find(
      (each) => ts.isIdentifier(each.name) && each.name.text === name,
    )?.initializer;
    const value = found === undefined ? undefined : withoutParentheses(found);
    if (value !== undefined && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
      return value;
    }
  }
  return undefined;
}

function moduleStep(from: Parsed, specifier: string, name: string): Lookup | undefined {
  const resolved = resolveModuleSpecifier(specifier, from.facts.file);
  const target =
    resolved.kind === 'file' && resolved.path !== undefined ? parsedFile(resolved.path) : undefined;
  return target === undefined ? undefined : { parsed: target, name, exported: true };
}

function nextLookup({ parsed, name, exported }: Lookup): Lookup | HookBody | undefined {
  const { facts, source } = parsed;
  const target = exported ? facts.exports.get(name) : undefined;
  if (target?.kind === 'forwarded') {
    return moduleStep(parsed, target.from.source, target.from.name);
  }
  if (target?.kind === 'local') {
    return { parsed, name: target.name, exported: false };
  }
  const imported = exported ? undefined : facts.imports.get(name);
  return imported === undefined
    ? declaredFunction(source, name)
    : moduleStep(parsed, imported.source, imported.name);
}

function hookBody(start: Lookup): HookBody | undefined {
  const pending: Lookup[] = [start];
  for (const lookup of pending) {
    const next = nextLookup(lookup);
    if (next !== undefined && !('parsed' in next)) {
      return next;
    }
    if (next !== undefined && pending.length < MAX_LOOKUPS) {
      pending.push(next);
    }
  }
  return undefined;
}

function currentFile(file: string, sourceCode: object, text: string): Parsed {
  return cachedValue(currentFiles, sourceCode, () => parse(file, text));
}

function verdictOf(parsed: Parsed, name: string): boolean {
  const body = hookBody({ parsed, name, exported: false });
  return body !== undefined && returnsTypeofTest(body);
}

export function isBrowserTestHook(
  file: string,
  sourceCode: { readonly text: string },
  name: string,
): boolean {
  const parsed = currentFile(file, sourceCode, sourceCode.text);
  const known = cachedValue(verdicts, parsed, () => new Map<string, { readonly test: boolean }>());
  return cachedValue(known, name, () => ({ test: verdictOf(parsed, name) })).test;
}
