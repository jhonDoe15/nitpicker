import ts from 'typescript';
import { containerApiOf, isLookupMemberName } from './container-apis.mjs';

export function memberNameNode(expression) {
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

function destructuredLookup(element, checker) {
  if (!ts.isBindingElement(element) || !ts.isObjectBindingPattern(element.parent)) {
    return undefined;
  }
  const name = element.propertyName ?? element.name;
  if (!(ts.isIdentifier(name) || ts.isStringLiteralLike(name)) || !isLookupMemberName(name.text)) {
    return undefined;
  }
  return containerApiOf(checker.getTypeAtLocation(element.parent).getProperty(name.text));
}

export function directLookup(node, checker) {
  const name = memberNameNode(node);
  if (name !== undefined) {
    return isLookupMemberName(name.text)
      ? containerApiOf(checker.getSymbolAtLocation(name))
      : undefined;
  }
  return destructuredLookup(node, checker);
}
