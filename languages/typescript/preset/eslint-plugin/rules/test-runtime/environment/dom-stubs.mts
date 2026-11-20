import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { STUBBABLE_DOM_GLOBALS } from './dom-globals.mts';

type Node = TypeScript.Node;
type Expression = TypeScript.Expression;

export type StubbedGlobal = 'dom' | typeof OPAQUE;

const OPAQUE = 'opaque';
const TEST_API_OBJECTS = ['vi', 'vitest', 'jest'];
const TEST_API_MODULES = new Set(['vitest', '@jest/globals']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'self', 'window']);
const TEST_API_STUBS = new Set(['spyOn', 'replaceProperty']);
const KEYED_STUBS = new Map<string, ReadonlySet<string>>([
  ['Object', new Set(['defineProperty'])],
  ['Reflect', new Set(['defineProperty', 'set'])],
]);
const LITERAL_STUBS = new Map<string, ReadonlySet<string>>([
  ['Object', new Set(['defineProperties', 'assign'])],
]);

function wrappedExpression(node: Node): Node | undefined {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
    ? node.expression
    : undefined;
}

export function unwrappedExpression(node: Expression): Expression {
  const chain: Node[] = [node];
  for (const current of chain) {
    const inner = wrappedExpression(current);
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  return chain.filter(ts.isExpression).at(-1) ?? node;
}

function importedAlias(node: Node): string | undefined {
  if (!(
    ts.isImportSpecifier(node) && TEST_API_OBJECTS.includes((node.propertyName ?? node.name).text)
  )) {
    return undefined;
  }
  const declaration = node.parent.parent.parent;
  const fromTestModule =
    ts.isStringLiteralLike(declaration.moduleSpecifier) &&
    TEST_API_MODULES.has(declaration.moduleSpecifier.text);
  return fromTestModule ? node.name.text : undefined;
}

function variableAlias(node: Node, names: ReadonlySet<string>): string | undefined {
  if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))) {
    return undefined;
  }
  const initializer =
    node.initializer === undefined ? undefined : unwrappedExpression(node.initializer);
  return initializer !== undefined && ts.isIdentifier(initializer) && names.has(initializer.text)
    ? node.name.text
    : undefined;
}

export function testApiNames(sourceFile: TypeScript.SourceFile): ReadonlySet<string> {
  const names = new Set(TEST_API_OBJECTS);
  const nodes: Node[] = [sourceFile];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
    const aliases = [importedAlias(node), variableAlias(node, names)].filter(
      (alias) => alias !== undefined,
    );
    for (const alias of aliases) {
      names.add(alias);
    }
  }
  return names;
}

function memberName(callee: TypeScript.LeftHandSideExpression): string | undefined {
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
    return callee.argumentExpression.text;
  }
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function ownerName(callee: Expression): string | undefined {
  if (!(ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))) {
    return undefined;
  }
  const owner = unwrappedExpression(callee.expression);
  if (ts.isIdentifier(owner)) {
    return owner.text;
  }
  return ts.isPropertyAccessExpression(owner) ? owner.name.text : undefined;
}

function nameVerdict(name: string | undefined): StubbedGlobal | undefined {
  if (name === undefined) {
    return OPAQUE;
  }
  return STUBBABLE_DOM_GLOBALS.has(name) || name === 'navigator' ? 'dom' : undefined;
}

function keyVerdict(key: Expression | undefined): StubbedGlobal | undefined {
  if (key === undefined) {
    return undefined;
  }
  const literal = unwrappedExpression(key);
  return nameVerdict(ts.isStringLiteralLike(literal) ? literal.text : undefined);
}

function propertyVerdicts(argument: Expression | undefined): (StubbedGlobal | undefined)[] {
  const literal = argument === undefined ? undefined : unwrappedExpression(argument);
  if (literal === undefined) {
    return [];
  }
  if (!ts.isObjectLiteralExpression(literal)) {
    return [OPAQUE];
  }
  return literal.properties.map(({ name }) =>
    name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
      ? nameVerdict(name.text)
      : OPAQUE,
  );
}

function combined(verdicts: readonly (StubbedGlobal | undefined)[]): StubbedGlobal | undefined {
  if (verdicts.includes('dom')) {
    return 'dom';
  }
  return verdicts.includes(OPAQUE) ? OPAQUE : undefined;
}

function isGlobalObject(node: Expression | undefined): boolean {
  const target = node === undefined ? undefined : unwrappedExpression(node);
  return target !== undefined && ts.isIdentifier(target) && GLOBAL_OBJECTS.has(target.text);
}

function callVerdict(call: TypeScript.CallExpression, apis: ReadonlySet<string>) {
  const method = memberName(call.expression);
  const owner = ownerName(call.expression);
  const [target, second] = call.arguments;
  const fromTestApi = owner === undefined ? true : apis.has(owner);
  if (method === 'stubGlobal' && fromTestApi) {
    return keyVerdict(target);
  }
  if (!isGlobalObject(target) || method === undefined || owner === undefined) {
    return undefined;
  }
  if ((apis.has(owner) && TEST_API_STUBS.has(method)) || KEYED_STUBS.get(owner)?.has(method)) {
    return keyVerdict(second);
  }
  return LITERAL_STUBS.get(owner)?.has(method) === true
    ? combined(propertyVerdicts(second))
    : undefined;
}

function destructuredVerdict(node: TypeScript.VariableDeclaration): StubbedGlobal | undefined {
  if (
    !ts.isObjectBindingPattern(node.name) ||
    node.initializer === undefined ||
    !isGlobalObject(node.initializer)
  ) {
    return undefined;
  }
  return combined(
    node.name.elements.map((element) => {
      const key = element.propertyName ?? element.name;
      return ts.isIdentifier(key) && element.dotDotDotToken === undefined
        ? nameVerdict(key.text)
        : OPAQUE;
    }),
  );
}

export function stubbedGlobalOf(node: Node, apis: ReadonlySet<string>): StubbedGlobal | undefined {
  if (ts.isCallExpression(node)) {
    return callVerdict(node, apis);
  }
  return ts.isVariableDeclaration(node) ? destructuredVerdict(node) : undefined;
}
