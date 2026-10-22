import ts from 'typescript';
import { containerApiOf, isRegistrationMethod, isRegistrationProperty } from './container-apis.mjs';

function memberNameNode(expression) {
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression;
  }
  return undefined;
}

function propertyKey(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function isRegistrationCallback(fn) {
  const holder = fn.parent;
  if (ts.isPropertyAssignment(holder)) {
    return isRegistrationProperty(propertyKey(holder.name));
  }
  if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(holder)) {
    return isRegistrationProperty(propertyKey(fn.name));
  }
  if (ts.isCallExpression(holder) && holder.arguments.includes(fn)) {
    return isRegistrationMethod(memberNameNode(holder.expression)?.text);
  }
  return false;
}

export function isInRegistrationCallback(node) {
  return (
    ts.findAncestor(node.parent, (ancestor) => {
      return ts.isFunctionLike(ancestor) && isRegistrationCallback(ancestor);
    }) !== undefined
  );
}

export function directLookup(node, checker) {
  if (ts.isCallExpression(node)) {
    const name = memberNameNode(node.expression);
    return name === undefined ? undefined : containerApiOf(checker.getSymbolAtLocation(name));
  }
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'cradle') {
    return containerApiOf(checker.getSymbolAtLocation(node.name));
  }
  return undefined;
}
