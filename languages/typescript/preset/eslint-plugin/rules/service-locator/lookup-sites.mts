import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { containerApiOf, isLookupMemberName, type ContainerApi } from './container-apis.mts';

type NameNode = TypeScript.MemberName | TypeScript.StringLiteralLike;
type PatternSource = { readonly pattern: TypeScript.Node; readonly key: TypeScript.Node };

export function memberNameNode(expression: TypeScript.Node): NameNode | undefined {
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

function patternSource(element: TypeScript.Node): PatternSource | undefined {
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

function destructuredLookup(
  element: TypeScript.Node,
  checker: TypeScript.TypeChecker,
): ContainerApi | undefined {
  const source = patternSource(element);
  const name = source?.key;
  if (
    source === undefined ||
    name === undefined ||
    !(ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ||
    !isLookupMemberName(name.text)
  ) {
    return undefined;
  }
  return containerApiOf(checker.getTypeAtLocation(source.pattern).getProperty(name.text));
}

export function directLookup(
  node: TypeScript.Node,
  checker: TypeScript.TypeChecker,
): ContainerApi | undefined {
  const name = memberNameNode(node);
  if (name !== undefined) {
    return isLookupMemberName(name.text)
      ? containerApiOf(checker.getSymbolAtLocation(name))
      : undefined;
  }
  return destructuredLookup(node, checker);
}
