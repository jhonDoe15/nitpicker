import { ts } from '../../../../typescript-api/typescript-api.mts';
import type { PartsNode } from '../typed/syntax-types.mts';
import type TypeScript from 'typescript';

const TYPE_ONLY_KINDS = new Set([
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.IndexSignature,
  ts.SyntaxKind.PublicKeyword,
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.ReadonlyKeyword,
  ts.SyntaxKind.AbstractKeyword,
  ts.SyntaxKind.OverrideKeyword,
  ts.SyntaxKind.DeclareKeyword,
]);
const TYPE_LEADERS = new Set<TypeScript.SyntaxKind | undefined>([
  ts.SyntaxKind.ColonToken,
  ts.SyntaxKind.AsKeyword,
  ts.SyntaxKind.SatisfiesKeyword,
  ts.SyntaxKind.LessThanToken,
]);
const MARKED_DECLARATIONS = [
  ts.isParameter,
  ts.isPropertyDeclaration,
  ts.isMethodDeclaration,
  ts.isVariableDeclaration,
];

function isTypeOnlyNode(node: TypeScript.Node, parent: TypeScript.Node): boolean {
  if (TYPE_ONLY_KINDS.has(node.kind) || isSignatureOnly(node)) {
    return true;
  }
  if (ts.isHeritageClause(node)) {
    return node.token === ts.SyntaxKind.ImplementsKeyword;
  }
  if (ts.isNonNullExpression(parent)) {
    return node.kind === ts.SyntaxKind.ExclamationToken;
  }
  const marked = MARKED_DECLARATIONS.some((matches) => matches(parent));
  const questionToken: unknown = Reflect.get(parent, 'questionToken');
  const exclamationToken: unknown = Reflect.get(parent, 'exclamationToken');
  return marked && (node === questionToken || node === exclamationToken);
}

function isDeclared(node: TypeScript.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some(({ kind }) => kind === ts.SyntaxKind.DeclareKeyword);
}

function isThisParameter(node: TypeScript.Node): boolean {
  return ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === 'this';
}

function isSignatureOnly(node: TypeScript.Node): boolean {
  if (ts.isPropertyDeclaration(node) || ts.isVariableStatement(node)) {
    return isDeclared(node);
  }
  if (isThisParameter(node)) {
    return true;
  }
  return (
    (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body === undefined
  );
}

function typeListAt(parent: PartsNode, child: TypeScript.Node): boolean {
  return [parent.typeParameters, parent.typeArguments].some(
    (list) =>
      list !== undefined &&
      child.kind === ts.SyntaxKind.SyntaxList &&
      list.pos === child.pos &&
      list.end === child.end,
  );
}

function isTypeAnnotation(parent: PartsNode, child: TypeScript.Node): boolean {
  return child === parent.type && ts.isTypeNode(child);
}

function hasSingleBareParameter(node: TypeScript.Node): boolean {
  if (!ts.isArrowFunction(node) || node.parameters.length !== 1) {
    return false;
  }
  const [parameter] = node.parameters;
  return (
    parameter !== undefined &&
    ts.isIdentifier(parameter.name) &&
    parameter.initializer === undefined &&
    parameter.dotDotDotToken === undefined
  );
}

function isWrappedAssertion(node: TypeScript.Node): boolean {
  if (!ts.isParenthesizedExpression(node)) {
    return false;
  }
  const { expression } = node;
  return (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  );
}

function isOptionalParenthesis(parent: TypeScript.Node, child: TypeScript.Node): boolean {
  const parenthesis =
    child.kind === ts.SyntaxKind.OpenParenToken || child.kind === ts.SyntaxKind.CloseParenToken;
  return parenthesis && (hasSingleBareParameter(parent) || isWrappedAssertion(parent));
}

function typeSpans(parent: PartsNode, children: readonly TypeScript.Node[]): number[] {
  return children.flatMap((child, index) => {
    if (typeListAt(parent, child)) {
      return [index - 1, index, index + 1];
    }
    if (isOptionalParenthesis(parent, child)) {
      return [index];
    }
    if (isThisParameter(child)) {
      return children[index + 1]?.kind === ts.SyntaxKind.CommaToken ? [index, index + 1] : [index];
    }
    if (!isTypeAnnotation(parent, child)) {
      return [];
    }
    const closing = ts.isTypeAssertionExpression(parent) ? [index + 1] : [];
    return [index - 1, index, ...closing].filter(
      (position) => position !== index - 1 || TYPE_LEADERS.has(children[position]?.kind),
    );
  });
}

export function untypedChildren(
  parent: PartsNode,
  children: readonly TypeScript.Node[],
): TypeScript.Node[] {
  const skipped = new Set(typeSpans(parent, children));
  return children.filter((child, index) => !(skipped.has(index) || isTypeOnlyNode(child, parent)));
}

export function untypedParts(node: PartsNode): TypeScript.Node[] {
  return [
    ...(node.parameters ?? []),
    ...(node.heritageClauses ?? []),
    ...(node.members ?? []),
    node.initializer,
    node.body,
  ].flatMap((part) => (part !== undefined && !isTypeOnlyNode(part, node) ? [part] : []));
}
