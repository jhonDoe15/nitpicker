import ts from 'typescript';
import type {
  Expr,
  ExtractContext,
  FunctionNode,
  LitValue,
  Unsupported,
} from '../model/syntax-types.mts';
import { locationOf } from './program.mts';

type Literal = { readonly value: LitValue };

function importDeclarationOf(node: ts.Node): ts.ImportDeclaration | undefined {
  return ts.findAncestor(node, ts.isImportDeclaration);
}

function importExpr(declaration: ts.Declaration, importDeclaration: ts.ImportDeclaration): Expr {
  const { moduleSpecifier } = importDeclaration;
  if (!ts.isStringLiteral(moduleSpecifier)) {
    throw new Error('flow-model: import declaration without a string module specifier');
  }
  const module = moduleSpecifier.text;
  if (ts.isImportSpecifier(declaration)) {
    return { kind: 'import', module, name: (declaration.propertyName ?? declaration.name).text };
  }
  return { kind: 'import', module, name: ts.isNamespaceImport(declaration) ? '*' : 'default' };
}

function isTopLevel(declaration: ts.Declaration): boolean {
  return ts.findAncestor(declaration.parent, ts.isFunctionLike) === undefined;
}

function literalValue(node: ts.Node): Literal | undefined {
  const inner = ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? node.expression : node;
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return { value: inner.text };
  }
  return ts.isNumericLiteral(inner) ? { value: Number(inner.text) } : undefined;
}

function enumMembers(declaration: ts.EnumDeclaration): Record<string, LitValue> {
  const members: Record<string, LitValue> = {};
  for (const member of declaration.members) {
    const value = member.initializer === undefined ? undefined : literalValue(member.initializer);
    if (value !== undefined && ts.isIdentifier(member.name)) {
      members[member.name.text] = value.value;
    }
  }
  return members;
}

function isConstAssertion(node: ts.Node): node is ts.AsExpression {
  return ts.isAsExpression(node) && ts.isConstTypeReference(node.type);
}

function plainProperty(
  property: ts.ObjectLiteralElementLike,
): { readonly name: string; readonly initializer: ts.Expression } | undefined {
  if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
    return { name: property.name.text, initializer: property.initializer };
  }
  return undefined;
}

function objectMembers(initializer: ts.Expression): Record<string, LitValue> | undefined {
  if (!isConstAssertion(initializer) || !ts.isObjectLiteralExpression(initializer.expression)) {
    return undefined;
  }
  const { properties } = initializer.expression;
  const plain = properties.map(plainProperty).filter((property) => property !== undefined);
  if (plain.length !== properties.length) {
    return undefined;
  }
  const members = new Map<string, Literal | undefined>();
  for (const property of plain) {
    members.set(property.name, literalValue(property.initializer));
  }
  const defined: [string, LitValue][] = [];
  for (const [key, value] of members) {
    if (value !== undefined) {
      defined.push([key, value.value]);
    }
  }
  return Object.fromEntries(defined);
}

function isFunctionValue(
  initializer: ts.Node | undefined,
): initializer is ts.ArrowFunction | ts.FunctionExpression {
  return (
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
  );
}

function isObjectValue(initializer: ts.Expression): boolean {
  const inner = isConstAssertion(initializer) ? initializer.expression : initializer;
  return ts.isObjectLiteralExpression(inner) || ts.isArrayLiteralExpression(inner);
}

function outerUnsupported(node: ts.Node, cx: ExtractContext, syntax: string): Unsupported {
  const loc = locationOf(cx.sourceFile, node);
  return { kind: 'unsupported', syntax, hasCall: false, mutates: false, clobbers: [], loc };
}

function variableBinding(
  declaration: ts.VariableDeclaration,
  name: string,
  node: ts.Identifier,
  cx: ExtractContext,
): Expr {
  const { initializer } = declaration;
  if (
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) === 0 ||
    initializer === undefined
  ) {
    return outerUnsupported(node, cx, 'mutable-module-binding');
  }
  if (isFunctionValue(initializer)) {
    return { kind: 'helper', name };
  }
  const literal = literalValue(initializer);
  if (literal !== undefined) {
    return { kind: 'lit', value: literal.value, via: name };
  }
  const members = objectMembers(initializer);
  return {
    kind: 'module',
    name,
    object: isObjectValue(initializer),
    ...(members === undefined ? {} : { members }),
  };
}

function requiredName(name: ts.Identifier | undefined): string {
  if (name === undefined) {
    throw new Error('flow-model: a referenced function declaration has no name');
  }
  return name.text;
}

export function moduleBinding(
  declaration: ts.Declaration,
  node: ts.Identifier,
  cx: ExtractContext,
): Expr {
  const importDeclaration = importDeclarationOf(declaration);
  if (importDeclaration !== undefined) {
    return importExpr(declaration, importDeclaration);
  }
  if (!isTopLevel(declaration)) {
    return outerUnsupported(node, cx, 'outer-binding');
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return { kind: 'helper', name: requiredName(declaration.name) };
  }
  if (ts.isEnumDeclaration(declaration)) {
    const name = declaration.name.text;
    return { kind: 'module', name, object: true, members: enumMembers(declaration) };
  }
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    return variableBinding(declaration, declaration.name.text, node, cx);
  }
  return { kind: 'module', name: node.text, object: ts.isClassDeclaration(declaration) };
}

function hasBody<F extends { readonly body?: unknown }>(
  fn: F,
): fn is F & { readonly body: NonNullable<F['body']> } {
  return fn.body !== undefined;
}

export function findFunction(sourceFile: ts.SourceFile, name: string): FunctionNode | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      if (hasBody(statement)) {
        return statement;
      }
    }
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    const match = declarations.find(
      (item) => ts.isIdentifier(item.name) && item.name.text === name,
    );
    if (match !== undefined && isFunctionValue(match.initializer)) {
      return match.initializer;
    }
  }
  return undefined;
}
