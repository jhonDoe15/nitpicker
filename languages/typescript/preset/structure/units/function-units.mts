import type TypeScript from 'typescript';
import { parentOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type {
  FunctionLike,
  UnitContext,
  Unit,
  UnitFound,
  UnitScope,
  Wrapper,
} from './function-unit-types.mts';

const ts = typescriptApi();

const ANONYMOUS = '<anonymous>';
function isWrapper(node: TypeScript.Node): node is Wrapper {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

export function isFunctionLike(node: TypeScript.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function textOf(sourceFile: TypeScript.SourceFile, name: TypeScript.Node): string {
  return ts.isStringLiteralLike(name) ? name.text : name.getText(sourceFile);
}

function inner(node: TypeScript.Expression): TypeScript.Expression {
  const chain = [node];
  for (const current of chain) {
    if (isWrapper(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

function curriedBody(
  node: TypeScript.Node,
): TypeScript.ArrowFunction | TypeScript.FunctionExpression | undefined {
  if (!ts.isArrowFunction(node) || ts.isBlock(node.body)) {
    return undefined;
  }
  const body = inner(node.body);
  const isFunction = ts.isArrowFunction(body) || ts.isFunctionExpression(body);
  return isFunction && body.name === undefined ? body : undefined;
}

function unwrap(node: TypeScript.Node): TypeScript.Node {
  const chain = [node];
  for (const current of chain) {
    const parent = parentOf(current);
    if (parent !== undefined && isWrapper(parent)) {
      chain.push(parent);
    }
  }
  return chain.at(-1) ?? node;
}

export function curriedChain(node: FunctionLike): FunctionLike[] {
  const chain = [node];
  for (const current of chain) {
    const next = curriedBody(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  return chain;
}

export function isCurriedInner(node: TypeScript.Node): boolean {
  const outer = parentOf(unwrap(node));
  return outer !== undefined && isFunctionLike(outer) && curriedBody(outer) === node;
}

function bindingName(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): string | undefined {
  const parent = parentOf(unwrap(node));
  if (parent === undefined) {
    return undefined;
  }
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    parent.initializer === unwrap(node)
  ) {
    return textOf(sourceFile, parent.name);
  }
  if (ts.isPropertyDeclaration(parent) && parent.initializer === unwrap(node)) {
    return textOf(sourceFile, parent.name);
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === unwrap(node)
  ) {
    return parent.left.getText(sourceFile);
  }
  return ts.isExportAssignment(parent) ? 'default' : undefined;
}

function localName(sourceFile: TypeScript.SourceFile, node: FunctionLike): string {
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (node.name !== undefined) {
    return textOf(sourceFile, node.name);
  }
  const isDefaultExport = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
  return isDefaultExport ? 'default' : (bindingName(sourceFile, node) ?? ANONYMOUS);
}

function lineRange(
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.Node,
): { start: number; end: number } {
  return {
    start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function classScope(
  { sourceFile }: UnitContext,
  node: TypeScript.Node,
  scope: string[],
): UnitScope | undefined {
  if (!ts.isClassLike(node)) {
    return undefined;
  }
  return { scope: [...scope, node.name?.text ?? bindingName(sourceFile, node) ?? ANONYMOUS] };
}

function objectScope(
  { sourceFile }: UnitContext,
  node: TypeScript.Node,
  scope: string[],
): UnitScope | undefined {
  if (!ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const name = bindingName(sourceFile, node);
  return { scope: name === undefined ? scope : [...scope, name] };
}

function uniqueName(name: string, scope: string[], anonymousCounts: Map<string, number>): string {
  if (name !== ANONYMOUS) {
    return name;
  }
  const key = scope.join('.');
  const count = (anonymousCounts.get(key) ?? 0) + 1;
  anonymousCounts.set(key, count);
  return count === 1 ? name : `<anonymous#${String(count)}>`;
}

function functionScope(
  { sourceFile, anonymousCounts }: UnitContext,
  node: TypeScript.Node,
  scope: string[],
): UnitScope | undefined {
  if (!isFunctionLike(node)) {
    return undefined;
  }
  if (isCurriedInner(node)) {
    return { scope, unit: { kind: 'function', range: node, folded: true } };
  }
  return {
    scope: [...scope, uniqueName(localName(sourceFile, node), scope, anonymousCounts)],
    unit: { kind: 'function', range: node },
  };
}

function fieldScope(
  { sourceFile }: UnitContext,
  node: TypeScript.Node,
  scope: string[],
): UnitScope | undefined {
  if (
    !ts.isPropertyDeclaration(node) ||
    node.initializer === undefined ||
    isFunctionLike(inner(node.initializer))
  ) {
    return undefined;
  }
  return {
    scope: [...scope, textOf(sourceFile, node.name)],
    unit: { kind: 'initializer', range: node.initializer },
  };
}

function staticBlockScope(
  _context: UnitContext,
  node: TypeScript.Node,
  scope: string[],
): UnitScope | undefined {
  if (!ts.isClassStaticBlockDeclaration(node)) {
    return undefined;
  }
  return { scope: [...scope, '<static>'], unit: { kind: 'initializer', range: node } };
}

const SCOPES = [classScope, objectScope, functionScope, fieldScope, staticBlockScope];

function enter(context: UnitContext, node: TypeScript.Node, scope: string[]): UnitScope {
  for (const scopeOf of SCOPES) {
    const entered = scopeOf(context, node, scope);
    if (entered !== undefined) {
      return entered;
    }
  }
  return { scope };
}

function unitEntry(
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.Node,
  { scope, unit }: { scope: string[]; unit: Unit },
): UnitFound {
  return {
    node,
    at: node.getStart(sourceFile),
    name: scope.join('.'),
    kind: unit.kind,
    folded: unit.folded === true,
    ...lineRange(sourceFile, unit.range),
  };
}

export function functionUnits(sourceFile: TypeScript.SourceFile): {
  names: Map<TypeScript.Node, string>;
  units: { name: string; kind: string; start: number; end: number }[];
} {
  const found: UnitFound[] = [];
  const context: UnitContext = { sourceFile, anonymousCounts: new Map() };
  const pending: { node: TypeScript.Node; scope: string[] }[] = [{ node: sourceFile, scope: [] }];
  for (const { node, scope } of pending) {
    const entered = enter(context, node, scope);
    if (entered.unit !== undefined) {
      found.push(unitEntry(sourceFile, node, { scope: entered.scope, unit: entered.unit }));
    }
    ts.forEachChild(node, (child) => {
      pending.push({ node: child, scope: entered.scope });
    });
  }
  const names = new Map(
    found.filter(({ kind }) => kind === 'function').map(({ node, name }) => [node, name]),
  );
  const units = found
    .filter(({ folded }) => !folded)
    .toSorted((left, right) => left.at - right.at)
    .map(({ name, kind, start, end }) => ({ name, kind, start, end }));
  return { names, units };
}
