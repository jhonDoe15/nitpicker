import type TypeScript from 'typescript';
import { ts, chainOf } from '../../syntax/typed.mts';
import { isClosure, isWrapper, isWrite, lineOf, unwrap } from '../../syntax/nodes.mts';
import { isOwnerThis, localKey } from '../scope.mts';
import { branchesOf } from './branches.mts';
import { mutationOfCall } from './mutation.mts';
import { targetSite, valueSite } from './targets.mts';
import type { Fact, Scope, Site } from '../../design-types.mts';

type Node = TypeScript.Node;
type CallNode =
  | TypeScript.CallExpression
  | TypeScript.NewExpression
  | TypeScript.JsxOpeningElement
  | TypeScript.JsxSelfClosingElement;
type Counted = { order: number; fact: Record<string, unknown> };

function isCallNode(node: Node): node is CallNode {
  return (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isJsxOpeningElement(node) ||
    ts.isJsxSelfClosingElement(node)
  );
}

function receiverKey(scope: Scope, expression: Node): string | undefined {
  const value = unwrap(expression);
  if (value.kind === ts.SyntaxKind.ThisKeyword || value.kind === ts.SyntaxKind.SuperKeyword) {
    return isOwnerThis(scope, value) ? 'this' : undefined;
  }
  if (ts.isIdentifier(value)) {
    return localKey(scope, value);
  }
  const isOwnField =
    ts.isPropertyAccessExpression(value) &&
    value.expression.kind === ts.SyntaxKind.ThisKeyword &&
    isOwnerThis(scope, value.expression);
  return isOwnField ? `this.${value.name.text}` : undefined;
}

function calleeReceiver(scope: Scope, node: Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return receiverKey(scope, node.expression);
  }
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = unwrap(node.expression);
  const isMemberCall =
    ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee);
  return isMemberCall ? receiverKey(scope, callee.expression) : undefined;
}

function callLine(node: CallNode | TypeScript.PropertyAccessExpression): number {
  if (ts.isPropertyAccessExpression(node)) {
    return lineOf(node.name);
  }
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    return lineOf(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
  }
  return lineOf(ts.isNewExpression(node) ? node : node.tagName);
}

function isFinallyBlock(node: Node, root: Node): boolean {
  const { parent } = node;
  return node !== root && ts.isTryStatement(parent) && parent.finallyBlock === node;
}

function ownFunctionParent(root: Node): (current: Node) => Node | undefined {
  return (current) => (current === root || isClosure(current) ? undefined : current.parent);
}

function isInFinally(node: Node, root: Node): boolean {
  return chainOf(node, ownFunctionParent(root)).some((current) => isFinallyBlock(current, root));
}

function hasInstanceReceiver(site: Site): boolean {
  return (
    site.member !== undefined && site.isStatic !== true && !ts.isConstructorDeclaration(site.member)
  );
}

function callFact(scope: Scope, node: CallNode | TypeScript.PropertyAccessExpression, site: Site) {
  const receiver = hasInstanceReceiver(site) ? calleeReceiver(scope, node) : undefined;
  const isValue = ts.isCallExpression(node) || ts.isPropertyAccessExpression(node);
  const mutation = isValue ? mutationOfCall(scope, node) : undefined;
  const branch = branchesOf(scope, node);
  return {
    target: site.id,
    line: callLine(node),
    ...(receiver === undefined ? {} : { receiver }),
    ...(isInFinally(node, scope.site.node) ? { cleanup: true } : {}),
    ...(branch.length === 0 ? {} : { branch }),
    ...(mutation === undefined ? {} : { mutation }),
  };
}

function disposeSite(scope: Scope, declaration: TypeScript.VariableDeclaration): Site | undefined {
  const type = scope.checker.getTypeAtLocation(declaration.name);
  const property = scope.checker
    .getPropertiesOfType(type)
    .find(({ name }) => name.startsWith('__@dispose@') || name.startsWith('__@asyncDispose@'));
  const method = property?.valueDeclaration;
  return method === undefined ? undefined : scope.registry.siteByNode.get(method);
}

function usingDeclarations(scope: Scope): TypeScript.VariableDeclaration[] {
  return scope.nodes.filter(ts.isVariableDeclarationList).flatMap((list) => {
    return (list.flags & ts.NodeFlags.Using) === 0 ? [] : list.declarations;
  });
}

function disposalCall(
  scope: Scope,
  declaration: TypeScript.VariableDeclaration,
): Counted | undefined {
  const name = declaration.name;
  const site = ts.isIdentifier(name) ? disposeSite(scope, declaration) : undefined;
  if (site === undefined || !ts.isIdentifier(name)) {
    return undefined;
  }
  const receiver = localKey(scope, name);
  return {
    order: declaration.parent.parent.parent.getEnd(),
    fact: {
      target: site.id,
      line: lineOf(declaration),
      ...(receiver === undefined ? {} : { receiver }),
      cleanup: true,
    },
  };
}

function usingCalls(scope: Scope): Counted[] {
  return usingDeclarations(scope)
    .map((declaration) => disposalCall(scope, declaration))
    .filter((call) => call !== undefined);
}

function isCallee(node: Node): boolean {
  const value =
    chainOf(node, (current) => (isWrapper(current.parent) ? current.parent : undefined)).at(-1) ??
    node;
  const { parent } = value;
  return (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isDecorator(parent)) &&
    parent.expression === value
  );
}

function accessorRead(scope: Scope, node: Node): Site | undefined {
  if (!ts.isPropertyAccessExpression(node) || isWrite(node) || isCallee(node)) {
    return undefined;
  }
  const site = valueSite(scope, node);
  return site?.kind === 'accessor' ? site : undefined;
}

export function collectCalls(scope: Scope): Fact[] {
  const calls: Counted[] = [];
  for (const node of scope.nodes) {
    const site = isCallNode(node) ? targetSite(scope, node) : accessorRead(scope, node);
    if (site !== undefined && (isCallNode(node) || ts.isPropertyAccessExpression(node))) {
      calls.push({ order: node.getEnd(), fact: callFact(scope, node, site) });
    }
  }
  return [...calls, ...usingCalls(scope)]
    .toSorted((left, right) => left.order - right.order)
    .map(({ fact }) => fact);
}
