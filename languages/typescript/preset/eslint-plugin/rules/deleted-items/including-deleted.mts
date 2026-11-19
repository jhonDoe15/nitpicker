import type TypeScript from 'typescript';
import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mjs';
import { parentOf, ts, withoutParentheses } from '../typed/typescript-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { chainOf } from '../typed/node-views.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;
const INCLUDING = new Set(['including', 'include', 'includes', 'with']);
const COLLECTION_NOUNS = new Set([
  'items',
  'elements',
  'list',
  'rows',
  'records',
  'entries',
  'nodes',
]);
const MAX_DEPTH = 2;

export type ParameterSlot = {
  readonly owner: TypeScript.Node;
  readonly position: number;
};

function namesIncludeDeleted(name: string): boolean {
  const words = wordsOf(name);
  const last = words.length - (COLLECTION_NOUNS.has(words.at(-1) ?? '') ? 1 : 0);
  return words[last - 1] === 'deleted' && INCLUDING.has(words[last - 2] ?? '');
}

function declarationOf(
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Identifier,
): TypeScript.Declaration | undefined {
  return checker.getSymbolAtLocation(identifier)?.valueDeclaration;
}

function initializerOf(
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Identifier,
): TypeScript.Expression | undefined {
  const declaration = declarationOf(checker, identifier);
  const constant =
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
  return constant ? declaration.initializer : undefined;
}

function chainParts(node: TypeScript.Node): TypeScript.Node[] {
  if (ts.isPropertyAccessExpression(node)) {
    return [node.name, node.expression];
  }
  if (ts.isCallExpression(node)) {
    const from =
      ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from';
    return from ? [...node.arguments] : [node.expression];
  }
  const inner =
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isElementAccessExpression(node);
  return inner ? [node.expression] : [];
}

type Step = { readonly node: TypeScript.Node; readonly depth: number };

function stepsFrom(checker: TypeScript.TypeChecker, { node, depth }: Step): Step[] {
  const initializer =
    ts.isIdentifier(node) && depth < MAX_DEPTH ? initializerOf(checker, node) : undefined;
  const next = chainParts(node).map((part) => ({ node: part, depth }));
  return initializer === undefined ? next : [{ node: initializer, depth: depth + 1 }, ...next];
}

export function expressionIncludesDeleted(
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Node,
): boolean {
  const pending: Step[] = [{ node: expression, depth: 0 }];
  for (const step of pending) {
    if (ts.isIdentifier(step.node) && namesIncludeDeleted(step.node.text)) {
      return true;
    }
    appendAll(pending, stepsFrom(checker, step));
  }
  return false;
}

function isMethodCall(node: TypeScript.CallExpression, name: string): boolean {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name;
}

function innerReceiver(node: TypeScript.Expression): TypeScript.Expression | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const [only] = node.arguments;
  if (isMethodCall(node, 'values') && ts.isPropertyAccessExpression(node.expression)) {
    return withoutParentheses(node.expression.expression);
  }
  return isMethodCall(node, 'from') && node.arguments.length === 1 && only !== undefined
    ? withoutParentheses(only)
    : undefined;
}

function passedThrough(receiver: TypeScript.Expression): TypeScript.Expression {
  const start = withoutParentheses(receiver);
  return chainOf(start, innerReceiver).at(-1) ?? start;
}

export function parameterSlot(
  checker: TypeScript.TypeChecker,
  receiver: TypeScript.Expression,
): ParameterSlot | undefined {
  const node = passedThrough(receiver);
  const declaration = ts.isIdentifier(node) ? declarationOf(checker, node) : undefined;
  const owner = declaration === undefined ? undefined : parentOf(declaration);
  if (declaration === undefined || !ts.isParameter(declaration) || owner === undefined) {
    return undefined;
  }
  const position = ts.isFunctionLike(owner) ? owner.parameters.indexOf(declaration) : -1;
  return position < 0 ? undefined : { owner, position };
}

type Passes = { calls: number; including: number };

function declaredName(owner: TypeScript.Node): string | undefined {
  const named =
    ts.isFunctionDeclaration(owner) ||
    ts.isMethodDeclaration(owner) ||
    ts.isFunctionExpression(owner);
  return named && owner.name !== undefined && ts.isIdentifier(owner.name)
    ? owner.name.text
    : undefined;
}

function ownerName(owner: TypeScript.Node): string | undefined {
  const parent = parentOf(owner);
  const holder = parent !== undefined && ts.isVariableDeclaration(parent) ? parent.name : undefined;
  return (
    declaredName(owner) ??
    (holder !== undefined && ts.isIdentifier(holder) ? holder.text : undefined)
  );
}

export function calleeNameOf(call: TypeScript.CallExpression): string | undefined {
  const { expression } = call;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

export type CallSites = Map<TypeScript.Node, Map<number, Passes>>;

export type Scan = {
  readonly checker: TypeScript.TypeChecker;
  readonly names: ReadonlySet<string>;
  readonly sites: CallSites;
};

function recordCall(scan: Scan, call: TypeScript.CallExpression): void {
  const name = calleeNameOf(call);
  const owner =
    name !== undefined && scan.names.has(name)
      ? scan.checker.getResolvedSignature(call)?.declaration
      : undefined;
  if (owner === undefined) {
    return;
  }
  const positions = scan.sites.get(owner) ?? new Map<number, Passes>();
  for (const [position, argument] of call.arguments.entries()) {
    const passes = positions.get(position) ?? { calls: 0, including: 0 };
    passes.calls += 1;
    passes.including += expressionIncludesDeleted(scan.checker, argument) ? 1 : 0;
    positions.set(position, passes);
  }
  scan.sites.set(owner, positions);
}

export function descendantsOf(file: TypeScript.SourceFile): TypeScript.Node[] {
  const pending: TypeScript.Node[] = [file];
  for (const node of pending) {
    appendAll(pending, node.getChildren(file));
  }
  return pending;
}

export function recordCallSites(scan: Scan, file: TypeScript.SourceFile): void {
  for (const node of descendantsOf(file)) {
    if (ts.isCallExpression(node)) {
      recordCall(scan, node);
    }
  }
}

export function receivesIncludingDeleted(slot: ParameterSlot, sites: CallSites): boolean {
  const passes = sites.get(slot.owner)?.get(slot.position);
  return passes !== undefined && passes.calls > 0 && passes.including === passes.calls;
}

export function namesOfOwners(slots: readonly ParameterSlot[]): Set<string> {
  return new Set(slots.flatMap((slot) => ownerName(slot.owner) ?? []));
}
