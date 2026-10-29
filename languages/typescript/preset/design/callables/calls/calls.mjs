import ts from 'typescript';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { isClosure, isWrapper, isWrite, lineOf, unwrap } from '../../syntax/nodes.mjs';
import { isOwnerThis, localKey } from '../scope.mjs';
import { mutationOfCall } from './mutation.mjs';
import { targetSite, valueSite } from './targets.mjs';

function isCallNode(node) {
  return (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isJsxOpeningElement(node) ||
    ts.isJsxSelfClosingElement(node)
  );
}

function receiverKey(scope, expression) {
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

function calleeReceiver(scope, node) {
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

function callLine(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return lineOf(node.name);
  }
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    return lineOf(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
  }
  return lineOf(ts.isNewExpression(node) ? node : node.tagName);
}

function isFinallyBlock(node, root) {
  const { parent } = node;
  return (
    node !== root &&
    parent !== undefined &&
    ts.isTryStatement(parent) &&
    parent.finallyBlock === node
  );
}

function isInFinally(node, root) {
  const ownFunction = (current) =>
    current === root || isClosure(current) ? undefined : current.parent;
  return chainOf(node, ownFunction).some((current) => isFinallyBlock(current, root));
}

function hasInstanceReceiver(site) {
  return (
    site.member !== undefined && site.isStatic !== true && !ts.isConstructorDeclaration(site.member)
  );
}

function callFact(scope, node, site) {
  const receiver = hasInstanceReceiver(site) ? calleeReceiver(scope, node) : undefined;
  const isValue = ts.isCallExpression(node) || ts.isPropertyAccessExpression(node);
  const mutation = isValue ? mutationOfCall(scope, node) : undefined;
  return {
    target: site.id,
    line: callLine(node),
    ...(receiver === undefined ? {} : { receiver }),
    ...(isInFinally(node, scope.site.node) ? { cleanup: true } : {}),
    ...(mutation === undefined ? {} : { mutation }),
  };
}

function disposeSite(scope, declaration) {
  const type = scope.checker.getTypeAtLocation(declaration.name);
  const property = scope.checker
    .getPropertiesOfType(type)
    .find(({ name }) => name.startsWith('__@dispose@') || name.startsWith('__@asyncDispose@'));
  const method = property?.valueDeclaration;
  return method === undefined ? undefined : scope.registry.siteByNode.get(method);
}

function usingDeclarations(scope) {
  return scope.nodes.filter(ts.isVariableDeclarationList).flatMap((list) => {
    return (list.flags & ts.NodeFlags.Using) === 0 ? [] : list.declarations;
  });
}

function disposalCall(scope, declaration) {
  const site = ts.isIdentifier(declaration.name) ? disposeSite(scope, declaration) : undefined;
  if (site === undefined) {
    return undefined;
  }
  const receiver = localKey(scope, declaration.name);
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

function usingCalls(scope) {
  return usingDeclarations(scope)
    .map((declaration) => disposalCall(scope, declaration))
    .filter((call) => call !== undefined);
}

function isCallee(node) {
  const value = chainOf(node, (current) =>
    isWrapper(current.parent) ? current.parent : undefined,
  ).at(-1);
  const { parent } = value;
  return (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isDecorator(parent)) &&
    parent.expression === value
  );
}

function accessorRead(scope, node) {
  if (!ts.isPropertyAccessExpression(node) || isWrite(node) || isCallee(node)) {
    return undefined;
  }
  const site = valueSite(scope, node);
  return site?.kind === 'accessor' ? site : undefined;
}

export function collectCalls(scope) {
  const calls = [];
  for (const node of scope.nodes) {
    const site = isCallNode(node) ? targetSite(scope, node) : accessorRead(scope, node);
    if (site !== undefined) {
      calls.push({ order: node.getEnd(), fact: callFact(scope, node, site) });
    }
  }
  return [...calls, ...usingCalls(scope)]
    .toSorted((left, right) => left.order - right.order)
    .map(({ fact }) => fact);
}
