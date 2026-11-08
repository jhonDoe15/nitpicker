import { chainOf, depthFirst } from '../../../../shared/traversal.mjs';
import { ts } from '../../typescript-api/typescript-api.mjs';

export function unwrap(node) {
  return chainOf(node, (current) =>
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
      ? current.expression
      : undefined,
  ).at(-1);
}

function ancestorsOf(node) {
  return chainOf(node.parent, (current) => current.parent);
}

export function callbackBindings(fn, call, bindings) {
  const next = new Map(bindings);
  for (const [index, parameter] of fn.parameters.entries()) {
    const argument = call.arguments.at(index);
    if (argument) next.set(parameter, argument);
  }
  return next;
}

function memberName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression))
    return node.expression.text;
  return undefined;
}

export function functionLike(node) {
  return (
    node &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node))
  );
}

export function invokedReadName(invoked) {
  if (ts.isPropertyAccessExpression(invoked)) return invoked.name.text;
  return ts.isElementAccessExpression(invoked) && ts.isStringLiteral(invoked.argumentExpression)
    ? invoked.argumentExpression.text
    : undefined;
}

function containingClass(node) {
  return ancestorsOf(node).find(
    (parent) => ts.isClassDeclaration(parent) || ts.isClassExpression(parent),
  );
}

function parameterDeclaration(scope, name) {
  if (!functionLike(scope)) return undefined;
  return scope.parameters.find((item) => memberName(item.name) === name);
}

function importBinding(statement, name) {
  const clause = statement.importClause;
  if (clause?.name?.text === name) return clause;
  if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return undefined;
  return clause.namedBindings.elements.find((element) => element.name.text === name);
}

function statementDeclaration(statement, name) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.find((item) => memberName(item.name) === name);
  }
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
    statement.name?.text === name
  ) {
    return statement;
  }
  return ts.isImportDeclaration(statement) ? importBinding(statement, name) : undefined;
}

function scopeDeclaration(scope, name) {
  const parameter = parameterDeclaration(scope, name);
  if (parameter) return parameter;
  if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) return undefined;
  for (const statement of scope.statements) {
    const declaration = statementDeclaration(statement, name);
    if (declaration) return declaration;
  }
  return undefined;
}

function declarationFor(identifier) {
  for (const scope of ancestorsOf(identifier)) {
    const declaration = scopeDeclaration(scope, identifier.text);
    if (declaration) return declaration;
  }
  return undefined;
}

function referencedValue(node, bindings) {
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (bindings.has(declaration)) return { value: bindings.get(declaration) };
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return { value: declaration.initializer };
    if (declaration && functionLike(declaration)) return { value: declaration };
  }
  if (!ts.isPropertyAccessExpression(node) || node.expression.kind !== ts.SyntaxKind.ThisKeyword)
    return undefined;
  const member = containingClass(node)?.members.find(
    (item) => item.name && memberName(item.name) === node.name.text,
  );
  if (member && ts.isPropertyDeclaration(member) && member.initializer)
    return { value: member.initializer };
  return member && functionLike(member) ? { value: member } : undefined;
}

function resolveValue(expression, bindings = new Map(), seen = new Set()) {
  const pending = [expression];
  for (const current of pending) {
    const node = unwrap(current);
    if (!node || seen.has(node)) return node;
    seen.add(node);
    const reference = referencedValue(node, bindings);
    if (!reference) return node;
    pending.push(reference.value);
  }
  return undefined;
}

export function resolveCallback(expression, bindings) {
  const pending = [expression];
  const seen = new Set();
  for (const current of pending) {
    const node = resolveValue(current, bindings);
    if (functionLike(node)) return node;
    if (!node || seen.has(node)) return undefined;
    seen.add(node);
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== 'bind'
    )
      return undefined;
    pending.push(node.expression.expression);
  }
  return undefined;
}

function identifierValue(node, bindings) {
  const declaration = declarationFor(node);
  return (
    bindings.get(declaration) ??
    (declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined)
  );
}

function receiverPart(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
    ? node.argumentExpression.text
    : undefined;
}

function joinedPath(head, parts) {
  return [head, ...parts.toReversed()].join('.');
}

function identifierStep(node, bindings, parts) {
  const value = identifierValue(node, bindings);
  if (!value || ts.isNewExpression(unwrap(value))) {
    return { done: true, path: joinedPath(node.text, parts) };
  }
  return { done: false, next: value };
}

function accessStep(node, bindings, parts) {
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return { done: true, path: joinedPath('this', parts) };
  }
  if (ts.isIdentifier(node)) return identifierStep(node, bindings, parts);
  const part = receiverPart(node);
  if (part === undefined) return { done: true, path: undefined };
  parts.push(part);
  return { done: false, next: node.expression };
}

export function accessPath(expression, bindings, seen = new Set()) {
  const pending = [expression];
  const parts = [];
  for (const current of pending) {
    const node = unwrap(current);
    if (!node || seen.has(node)) return undefined;
    seen.add(node);
    const step = accessStep(node, bindings, parts);
    if (step.done) return step.path;
    pending.push(step.next);
  }
  return undefined;
}

export function constructedTarget(node) {
  const parent = ancestorsOf(node).find(
    (candidate) => !ts.isParenthesizedExpression(candidate) && !ts.isAsExpression(candidate),
  );
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  )
    return accessPath(parent.left, new Map());
  if (parent && ts.isVariableDeclaration(parent)) return memberName(parent.name);
  if (parent && ts.isPropertyDeclaration(parent)) return `this.${memberName(parent.name)}`;
  return undefined;
}

export function calleeName(expression) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (declaration && ts.isImportSpecifier(declaration))
      return declaration.propertyName?.text ?? declaration.name.text;
    return node.text;
  }
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

function optionProperty(property) {
  if (ts.isPropertyAssignment(property))
    return [{ name: memberName(property.name), value: property.initializer, node: property }];
  if (ts.isShorthandPropertyAssignment(property))
    return [{ name: property.name.text, value: property.name, node: property }];
  if (ts.isMethodDeclaration(property))
    return [{ name: memberName(property.name), value: property, node: property }];
  return [];
}

export function optionProperties(object, bindings, seen = new Set()) {
  function children(frame) {
    if (frame.property)
      return ts.isSpreadAssignment(frame.property) ? [{ value: frame.property.expression }] : [];
    const resolved = resolveValue(frame.value, bindings);
    if (!resolved || !ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) return [];
    seen.add(resolved);
    return [...resolved.properties].map((property) => ({ property }));
  }
  return [...depthFirst({ value: object }, children)].flatMap((frame) =>
    frame.property ? optionProperty(frame.property) : [],
  );
}
