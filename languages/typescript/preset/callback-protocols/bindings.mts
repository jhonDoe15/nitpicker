import type TypeScript from 'typescript';
import { typescriptApi, chainOf } from '../../adapters/typed/typescript-program.mts';
import { depthFirst } from '../architecture/typed/syntax-views.mts';
import type { Bindings, Declaration, FunctionLike, OptionProperty } from './callback-types.mts';

const ts = typescriptApi();

type Step =
  | { readonly done: true; readonly path: string | undefined }
  | { readonly done: false; readonly next: TypeScript.Node };

type OptionFrame =
  | { readonly value: TypeScript.Node; readonly property?: undefined }
  | { readonly property: TypeScript.ObjectLiteralElementLike; readonly value?: undefined };

export function unwrap(node: TypeScript.Node): TypeScript.Node {
  return (
    chainOf(node, (current) =>
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
        ? current.expression
        : undefined,
    ).at(-1) ?? node
  );
}

function ancestorsOf(node: TypeScript.Node): TypeScript.Node[] {
  return chainOf(node.parent, (current) => current.parent);
}

export function callbackBindings(
  fn: FunctionLike,
  call: TypeScript.CallExpression,
  bindings: Bindings,
): Bindings {
  const next = new Map(bindings);
  for (const [index, parameter] of fn.parameters.entries()) {
    const argument = call.arguments.at(index);
    if (argument) next.set(parameter, argument);
  }
  return next;
}

function memberName(node: TypeScript.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression))
    return node.expression.text;
  return undefined;
}

export function functionLike(node: TypeScript.Node | undefined): node is FunctionLike {
  return (
    node !== undefined &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node))
  );
}

export function invokedReadName(invoked: TypeScript.Node): string | undefined {
  if (ts.isPropertyAccessExpression(invoked)) return invoked.name.text;
  return ts.isElementAccessExpression(invoked) && ts.isStringLiteral(invoked.argumentExpression)
    ? invoked.argumentExpression.text
    : undefined;
}

function containingClass(
  node: TypeScript.Node,
): TypeScript.ClassDeclaration | TypeScript.ClassExpression | undefined {
  return ancestorsOf(node).find(
    (parent) => ts.isClassDeclaration(parent) || ts.isClassExpression(parent),
  );
}

function parameterDeclaration(
  scope: TypeScript.Node,
  name: string,
): TypeScript.ParameterDeclaration | undefined {
  if (!functionLike(scope)) return undefined;
  return scope.parameters.find((item) => memberName(item.name) === name);
}

function importBinding(
  statement: TypeScript.ImportDeclaration,
  name: string,
): TypeScript.ImportClause | TypeScript.ImportSpecifier | undefined {
  const clause = statement.importClause;
  if (clause?.name?.text === name) return clause;
  if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return undefined;
  return clause.namedBindings.elements.find((element) => element.name.text === name);
}

function statementDeclaration(
  statement: TypeScript.Statement,
  name: string,
): Declaration | undefined {
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

function scopeDeclaration(scope: TypeScript.Node, name: string): Declaration | undefined {
  const parameter = parameterDeclaration(scope, name);
  if (parameter) return parameter;
  if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) return undefined;
  for (const statement of scope.statements) {
    const declaration = statementDeclaration(statement, name);
    if (declaration) return declaration;
  }
  return undefined;
}

function declarationFor(identifier: TypeScript.Identifier): Declaration | undefined {
  for (const scope of ancestorsOf(identifier)) {
    const declaration = scopeDeclaration(scope, identifier.text);
    if (declaration) return declaration;
  }
  return undefined;
}

function referencedValue(
  node: TypeScript.Node,
  bindings: Bindings,
): { readonly value: TypeScript.Node } | undefined {
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    const bound = declaration === undefined ? undefined : bindings.get(declaration);
    if (bound) return { value: bound };
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

function resolveValue(
  expression: TypeScript.Node,
  bindings: Bindings = new Map(),
  seen = new Set<TypeScript.Node>(),
): TypeScript.Node | undefined {
  const pending = [expression];
  for (const current of pending) {
    const node = unwrap(current);
    if (seen.has(node)) return node;
    seen.add(node);
    const reference = referencedValue(node, bindings);
    if (!reference) return node;
    pending.push(reference.value);
  }
  return undefined;
}

export function resolveCallback(
  expression: TypeScript.Node,
  bindings: Bindings,
): FunctionLike | undefined {
  const pending = [expression];
  const seen = new Set<TypeScript.Node>();
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

function identifierValue(
  node: TypeScript.Identifier,
  bindings: Bindings,
): TypeScript.Node | undefined {
  const declaration = declarationFor(node);
  return (
    (declaration === undefined ? undefined : bindings.get(declaration)) ??
    (declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined)
  );
}

function receiverPart(node: TypeScript.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
    ? node.argumentExpression.text
    : undefined;
}

function joinedPath(head: string, parts: readonly string[]): string {
  return [head, ...parts.toReversed()].join('.');
}

function identifierStep(
  node: TypeScript.Identifier,
  bindings: Bindings,
  parts: readonly string[],
): Step {
  const value = identifierValue(node, bindings);
  if (!value || ts.isNewExpression(unwrap(value))) {
    return { done: true, path: joinedPath(node.text, parts) };
  }
  return { done: false, next: value };
}

function accessStep(node: TypeScript.Node, bindings: Bindings, parts: string[]): Step {
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return { done: true, path: joinedPath('this', parts) };
  }
  if (ts.isIdentifier(node)) return identifierStep(node, bindings, parts);
  const part = receiverPart(node);
  if (
    part === undefined ||
    !(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
  )
    return { done: true, path: undefined };
  parts.push(part);
  return { done: false, next: node.expression };
}

export function accessPath(
  expression: TypeScript.Node,
  bindings: Bindings,
  seen = new Set<TypeScript.Node>(),
): string | undefined {
  const pending = [expression];
  const parts: string[] = [];
  for (const current of pending) {
    const node = unwrap(current);
    if (seen.has(node)) return undefined;
    seen.add(node);
    const step = accessStep(node, bindings, parts);
    if (step.done) return step.path;
    pending.push(step.next);
  }
  return undefined;
}

export function constructedTarget(node: TypeScript.Node): string | undefined {
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

export function calleeName(expression: TypeScript.Node): string | undefined {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (declaration && ts.isImportSpecifier(declaration))
      return declaration.propertyName?.text ?? declaration.name.text;
    return node.text;
  }
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

function optionProperty(property: TypeScript.ObjectLiteralElementLike): OptionProperty[] {
  if (ts.isPropertyAssignment(property))
    return [{ name: memberName(property.name), value: property.initializer, node: property }];
  if (ts.isShorthandPropertyAssignment(property))
    return [{ name: property.name.text, value: property.name, node: property }];
  if (ts.isMethodDeclaration(property))
    return [{ name: memberName(property.name), value: property, node: property }];
  return [];
}

export function optionProperties(
  object: TypeScript.Node,
  bindings: Bindings,
  seen = new Set<TypeScript.Node>(),
): OptionProperty[] {
  function children(frame: OptionFrame): OptionFrame[] {
    if (frame.property)
      return ts.isSpreadAssignment(frame.property) ? [{ value: frame.property.expression }] : [];
    const resolved = resolveValue(frame.value, bindings);
    if (!resolved || !ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) return [];
    seen.add(resolved);
    return [...resolved.properties].map((property) => ({ property }));
  }
  return [...depthFirst<OptionFrame>({ value: object }, children)].flatMap((frame) =>
    frame.property ? optionProperty(frame.property) : [],
  );
}
