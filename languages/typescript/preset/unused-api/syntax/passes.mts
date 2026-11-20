import type TypeScript from 'typescript';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Passes } from '../typed/context-types.mts';

const ts = typescriptApi();

export function emptyPasses(): Passes {
  return { all: false, names: new Set() };
}

export function allPasses(): Passes {
  return { all: true, names: new Set() };
}

function innerExpression(node: TypeScript.Expression): TypeScript.Expression | undefined {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
    ? node.expression
    : undefined;
}

export function unwrapExpression(expression: TypeScript.Expression): TypeScript.Expression {
  return chainOf(expression, innerExpression).at(-1) ?? expression;
}

export function calleeName(callee: TypeScript.Node): string | undefined {
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function literalKeyName(name: TypeScript.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  const computed = ts.isComputedPropertyName(name) ? unwrapExpression(name.expression) : undefined;
  return computed !== undefined && ts.isStringLiteralLike(computed) ? computed.text : undefined;
}

function addProperty(property: TypeScript.ObjectLiteralElementLike, passes: Passes): void {
  if (ts.isSpreadAssignment(property)) {
    addExpression(property.expression, passes);
    return;
  }
  const key = ts.isPropertyName(property.name) ? literalKeyName(property.name) : undefined;
  if (key === undefined) passes.all = true;
  else passes.names.add(key);
}

function addExpression(expression: TypeScript.Expression, passes: Passes): void {
  const value = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(value)) {
    for (const property of value.properties) addProperty(property, passes);
  } else {
    passes.all = true;
  }
}

export function objectPasses(expression: TypeScript.Expression): Passes {
  const passes = emptyPasses();
  addExpression(expression, passes);
  return passes;
}

function hasJsxChildren(element: TypeScript.Node): boolean {
  return (
    ts.isJsxElement(element) &&
    element.children.some((child) => !ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces)
  );
}

export function jsxPasses(
  opening: TypeScript.JsxOpeningElement | TypeScript.JsxSelfClosingElement,
): Passes {
  const passes = emptyPasses();
  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) addExpression(attribute.expression, passes);
    else passes.names.add(attribute.name.getText());
  }
  const element = ts.isJsxOpeningElement(opening) ? opening.parent : undefined;
  if (element !== undefined && hasJsxChildren(element)) passes.names.add('children');
  return passes;
}
