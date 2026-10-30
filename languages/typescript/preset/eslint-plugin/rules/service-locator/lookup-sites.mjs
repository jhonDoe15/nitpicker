import { ts } from '../../../../typescript-api/typescript-api.mjs';
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

function patternSource(element) {
  if (ts.isBindingElement(element) && ts.isObjectBindingPattern(element.parent)) {
    return { pattern: element.parent, key: element.propertyName ?? element.name };
  }
  const isAssigned =
    (ts.isShorthandPropertyAssignment(element) || ts.isPropertyAssignment(element)) &&
    ts.isObjectLiteralExpression(element.parent) &&
    ts.isBinaryExpression(element.parent.parent) &&
    element.parent.parent.left === element.parent &&
    element.parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  return isAssigned ? { pattern: element.parent.parent.right, key: element.name } : undefined;
}

function destructuredLookup(element, checker) {
  const source = patternSource(element);
  const name = source?.key;
  if (
    name === undefined ||
    !(ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ||
    !isLookupMemberName(name.text)
  ) {
    return undefined;
  }
  return containerApiOf(checker.getTypeAtLocation(source.pattern).getProperty(name.text));
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
