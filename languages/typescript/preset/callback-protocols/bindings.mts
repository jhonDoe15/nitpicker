import type TypeScript from 'typescript';
import { typescriptApi, chainOf } from '../../adapters/typed/typescript-program.mts';
import type { Bindings, Declaration, FunctionLike } from './callback-types.mts';

const ts = typescriptApi();

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

export function ancestorsOf(node: TypeScript.Node): TypeScript.Node[] {
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
    if (argument) {
      next.set(parameter, argument);
    }
  }
  return next;
}

export function memberName(node: TypeScript.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) {
    return node.expression.text;
  }
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
  if (ts.isPropertyAccessExpression(invoked)) {
    return invoked.name.text;
  }
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
  if (!functionLike(scope)) {
    return undefined;
  }
  return scope.parameters.find((item) => memberName(item.name) === name);
}

function importBinding(
  statement: TypeScript.ImportDeclaration,
  name: string,
): TypeScript.ImportClause | TypeScript.ImportSpecifier | undefined {
  const clause = statement.importClause;
  if (clause?.name?.text === name) {
    return clause;
  }
  if (!(clause?.namedBindings && ts.isNamedImports(clause.namedBindings))) {
    return undefined;
  }
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
  if (parameter) {
    return parameter;
  }
  if (!(ts.isBlock(scope) || ts.isSourceFile(scope))) {
    return undefined;
  }
  for (const statement of scope.statements) {
    const declaration = statementDeclaration(statement, name);
    if (declaration) {
      return declaration;
    }
  }
  return undefined;
}

export function declarationFor(identifier: TypeScript.Identifier): Declaration | undefined {
  for (const scope of ancestorsOf(identifier)) {
    const declaration = scopeDeclaration(scope, identifier.text);
    if (declaration) {
      return declaration;
    }
  }
  return undefined;
}

function identifierReference(
  node: TypeScript.Identifier,
  bindings: Bindings,
): { readonly value: TypeScript.Node } | undefined {
  const declaration = declarationFor(node);
  const bound = declaration === undefined ? undefined : bindings.get(declaration);
  if (bound) {
    return { value: bound };
  }
  if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return { value: declaration.initializer };
  }
  return declaration && functionLike(declaration) ? { value: declaration } : undefined;
}

function thisMemberReference(
  node: TypeScript.Node,
): { readonly value: TypeScript.Node } | undefined {
  if (!ts.isPropertyAccessExpression(node) || node.expression.kind !== ts.SyntaxKind.ThisKeyword) {
    return undefined;
  }
  const member = containingClass(node)?.members.find(
    (item) => item.name && memberName(item.name) === node.name.text,
  );
  if (member && ts.isPropertyDeclaration(member) && member.initializer) {
    return { value: member.initializer };
  }
  return member && functionLike(member) ? { value: member } : undefined;
}

function referencedValue(
  node: TypeScript.Node,
  bindings: Bindings,
): { readonly value: TypeScript.Node } | undefined {
  const reference = ts.isIdentifier(node) ? identifierReference(node, bindings) : undefined;
  return reference ?? thisMemberReference(node);
}

export function resolveValue(
  expression: TypeScript.Node,
  bindings: Bindings = new Map(),
  seen = new Set<TypeScript.Node>(),
): TypeScript.Node | undefined {
  const pending = [expression];
  for (const current of pending) {
    const node = unwrap(current);
    if (seen.has(node)) {
      return node;
    }
    seen.add(node);
    const reference = referencedValue(node, bindings);
    if (!reference) {
      return node;
    }
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
    if (functionLike(node)) {
      return node;
    }
    if (!node || seen.has(node)) {
      return undefined;
    }
    seen.add(node);
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== 'bind'
    ) {
      return undefined;
    }
    pending.push(node.expression.expression);
  }
  return undefined;
}

export function calleeName(expression: TypeScript.Node): string | undefined {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (declaration && ts.isImportSpecifier(declaration)) {
      return declaration.propertyName?.text ?? declaration.name.text;
    }
    return node.text;
  }
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}
