import { ts } from '../../../typescript-api/typescript-api.mjs';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { followAlias } from './type-lookup.mjs';

function literalText(node) {
  const literal = node.literal;
  if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) {
    return literal.text;
  }
  if (ts.isNumericLiteral(literal)) {
    return literal.text;
  }
  const negative =
    ts.isPrefixUnaryExpression(literal) &&
    literal.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(literal.operand);
  return negative ? `-${literal.operand.text}` : undefined;
}

function referencedAlias(checker, node) {
  const name = ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
  const target = followAlias(checker, checker.getSymbolAtLocation(name));
  return (target?.declarations ?? []).find(ts.isTypeAliasDeclaration);
}

function isPlainReference(node) {
  return ts.isTypeReferenceNode(node) && node.typeArguments === undefined;
}

function caseChildren(checker, seen) {
  return (node) => {
    if (ts.isParenthesizedTypeNode(node)) {
      return [node.type];
    }
    if (ts.isUnionTypeNode(node)) {
      return node.types;
    }
    const target = isPlainReference(node) ? referencedAlias(checker, node) : undefined;
    if (target === undefined || seen.has(target)) {
      return [];
    }
    seen.add(target);
    return [target.type];
  };
}

function isTransparent(checker, node) {
  return (
    ts.isParenthesizedTypeNode(node) ||
    ts.isUnionTypeNode(node) ||
    (isPlainReference(node) && referencedAlias(checker, node) !== undefined)
  );
}

export function literalCases(checker, alias) {
  const cases = [];
  for (const node of depthFirst(alias.type, caseChildren(checker, new Set([alias])))) {
    const text = ts.isLiteralTypeNode(node) ? literalText(node) : undefined;
    if (text !== undefined) {
      cases.push(text);
    } else if (!isTransparent(checker, node)) {
      return undefined;
    }
  }
  const unique = [...new Set(cases)];
  return unique.length === 0 ? undefined : unique;
}

export function enumMemberNames(declaration) {
  return declaration.members.map((member) =>
    ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(),
  );
}
