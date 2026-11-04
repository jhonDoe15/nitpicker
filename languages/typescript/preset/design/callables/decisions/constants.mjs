import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { unwrap } from '../../syntax/nodes.mjs';

const EQUALITY = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken]);

export function constantOf(scope, expression) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    return node.operator === ts.SyntaxKind.MinusToken ? `-${node.operand.text}` : undefined;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return 'true';
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'false';
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return 'null';
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') {
    return 'undefined';
  }
  return enumMemberName(scope, node);
}

function enumOwnerName(node) {
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const owner = unwrap(node.expression);
  return ts.isPropertyAccessExpression(owner) ? owner.name : owner;
}

function enumMemberName(scope, node) {
  const ownerName = enumOwnerName(node);
  if (
    ownerName === undefined ||
    !ts.isIdentifier(ownerName) ||
    !scope.registry.enumNames.has(ownerName.text)
  ) {
    return undefined;
  }
  const symbol = scope.checker.getSymbolAtLocation(node.name);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.EnumMember
    ? node.name.text
    : undefined;
}

function equalityArm(scope, node) {
  if (!ts.isBinaryExpression(node) || !EQUALITY.has(node.operatorToken.kind)) {
    return undefined;
  }
  const right = constantOf(scope, node.right);
  if (right !== undefined) {
    return { subject: unwrap(node.left), constants: [right] };
  }
  const left = constantOf(scope, node.left);
  return left === undefined ? undefined : { subject: unwrap(node.right), constants: [left] };
}

function membershipArm(scope, node) {
  const callee = ts.isCallExpression(node) ? unwrap(node.expression) : undefined;
  const list =
    callee !== undefined && ts.isPropertyAccessExpression(callee)
      ? unwrap(callee.expression)
      : undefined;
  const isIncludes =
    list !== undefined &&
    ts.isArrayLiteralExpression(list) &&
    callee.name.text === 'includes' &&
    node.arguments.length === 1;
  const constants = isIncludes ? list.elements.map((element) => constantOf(scope, element)) : [];
  const valid =
    isIncludes && constants.length > 0 && constants.every((value) => value !== undefined);
  return valid ? { subject: unwrap(node.arguments[0]), constants } : undefined;
}

export function subjectKey(subject) {
  return subject.getText().replaceAll(/\s+/gu, '').replaceAll('?.', '.').replaceAll('!', '');
}

export function conditionArm(scope, condition) {
  const pending = [unwrap(condition)];
  const parts = [];
  for (const node of pending) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      pending.push(unwrap(node.left), unwrap(node.right));
    } else {
      parts.push({ at: node.pos, arm: equalityArm(scope, node) ?? membershipArm(scope, node) });
    }
  }
  const arms = parts.toSorted((left, right) => left.at - right.at).map(({ arm }) => arm);
  const [first] = arms;
  const same =
    first !== undefined &&
    arms.every((arm) => arm !== undefined && subjectKey(arm.subject) === subjectKey(first.subject));
  return same
    ? {
        subject: first.subject,
        constants: [...new Set(arms.flatMap(({ constants }) => constants))],
      }
    : undefined;
}
