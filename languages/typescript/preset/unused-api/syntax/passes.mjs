import { ts } from '../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../../../../shared/traversal.mjs';

export function emptyPasses() {
  return { all: false, names: new Set() };
}

export function allPasses() {
  return { all: true, names: new Set() };
}

function innerExpression(node) {
  return ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
    ? node.expression
    : undefined;
}

export function unwrapExpression(expression) {
  return chainOf(expression, innerExpression).at(-1);
}

/** The called name: `f` for `f()` and `React.f()`. */
export function calleeName(callee) {
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function literalKeyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  const computed = ts.isComputedPropertyName(name) ? unwrapExpression(name.expression) : undefined;
  return computed !== undefined && ts.isStringLiteralLike(computed) ? computed.text : undefined;
}

function addProperty(property, passes) {
  if (ts.isSpreadAssignment(property)) {
    addExpression(property.expression, passes);
    return;
  }
  const key = property.name === undefined ? undefined : literalKeyName(property.name);
  if (key === undefined) passes.all = true;
  else passes.names.add(key);
}

function addExpression(expression, passes) {
  const value = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(value)) {
    for (const property of value.properties) addProperty(property, passes);
  } else {
    passes.all = true;
  }
}

/** The property names an object-literal argument or spread sets; any other expression sets all. */
export function objectPasses(expression) {
  const passes = emptyPasses();
  addExpression(expression, passes);
  return passes;
}

function hasJsxChildren(element) {
  return (
    ts.isJsxElement(element) &&
    element.children.some((child) => !ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces)
  );
}

/** The props one JSX element passes: attributes, object-literal spreads and children. */
export function jsxPasses(opening) {
  const passes = emptyPasses();
  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) addExpression(attribute.expression, passes);
    else passes.names.add(attribute.name.getText());
  }
  const element = ts.isJsxOpeningElement(opening) ? opening.parent : undefined;
  if (element !== undefined && hasJsxChildren(element)) passes.names.add('children');
  return passes;
}
