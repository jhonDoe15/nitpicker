import { ts } from '../../../../typescript-api/typescript-api.mjs';

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
const TYPE_LEADERS = new Set([
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

function isTypeOnlyNode(node, parent) {
  if (TYPE_ONLY_KINDS.has(node.kind) || isSignatureOnly(node)) return true;
  if (ts.isHeritageClause(node)) return node.token === ts.SyntaxKind.ImplementsKeyword;
  if (ts.isNonNullExpression(parent)) return node.kind === ts.SyntaxKind.ExclamationToken;
  const marked = MARKED_DECLARATIONS.some((matches) => matches(parent));
  return marked && (node === parent.questionToken || node === parent.exclamationToken);
}

function isSignatureOnly(node) {
  if (ts.isPropertyDeclaration(node)) {
    return (ts.getModifiers(node) ?? []).some(({ kind }) => kind === ts.SyntaxKind.DeclareKeyword);
  }
  return (
    (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body === undefined
  );
}

function typeListAt(parent, child) {
  return [parent.typeParameters, parent.typeArguments].some(
    (list) =>
      list !== undefined &&
      child.kind === ts.SyntaxKind.SyntaxList &&
      list.pos === child.pos &&
      list.end === child.end,
  );
}

function isTypeAnnotation(parent, child) {
  return child === parent.type && ts.isTypeNode(child);
}

function typeSpans(parent, children) {
  return children.flatMap((child, index) => {
    if (typeListAt(parent, child)) return [index - 1, index, index + 1];
    if (!isTypeAnnotation(parent, child)) return [];
    const closing = ts.isTypeAssertionExpression(parent) ? [index + 1] : [];
    return [index - 1, index, ...closing].filter(
      (position) => position !== index - 1 || TYPE_LEADERS.has(children[position]?.kind),
    );
  });
}

export function untypedChildren(parent, children) {
  const skipped = new Set(typeSpans(parent, children));
  return children.filter((child, index) => !skipped.has(index) && !isTypeOnlyNode(child, parent));
}

export function untypedParts(node) {
  return [
    ...(node.parameters ?? []),
    ...(node.heritageClauses ?? []),
    ...(node.members ?? []),
    node.initializer,
    node.body,
  ].filter((part) => part !== undefined && !isTypeOnlyNode(part, node));
}
