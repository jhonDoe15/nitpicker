import type TypeScript from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { unwrap } from '../../syntax/nodes.mts';
import type { State } from '../../design-types.mts';

type Node = TypeScript.Node;
type Checked = Pick<State, 'registry' | 'checker'>;
type Arm = { subject: Node; constants: string[] };

const EQUALITY = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken]);

export function constantOf(scope: Checked, expression: Node): string | undefined {
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

function enumOwnerName(node: Node): Node | undefined {
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const owner = unwrap(node.expression);
  return ts.isPropertyAccessExpression(owner) ? owner.name : owner;
}

function enumMemberName(scope: Checked, node: Node): string | undefined {
  const ownerName = enumOwnerName(node);
  if (
    ownerName === undefined ||
    !ts.isIdentifier(ownerName) ||
    !scope.registry.enumNames.has(ownerName.text) ||
    !ts.isPropertyAccessExpression(node)
  ) {
    return undefined;
  }
  const symbol = scope.checker.getSymbolAtLocation(node.name);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.EnumMember
    ? node.name.text
    : undefined;
}

function equalityArm(scope: Checked, node: Node): Arm | undefined {
  if (!(ts.isBinaryExpression(node) && EQUALITY.has(node.operatorToken.kind))) {
    return undefined;
  }
  const right = constantOf(scope, node.right);
  if (right !== undefined) {
    return { subject: unwrap(node.left), constants: [right] };
  }
  const left = constantOf(scope, node.left);
  return left === undefined ? undefined : { subject: unwrap(node.right), constants: [left] };
}

function membershipArm(scope: Checked, node: Node): Arm | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = unwrap(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const list = unwrap(callee.expression);
  const [argument] = node.arguments;
  const isIncludes =
    ts.isArrayLiteralExpression(list) &&
    callee.name.text === 'includes' &&
    node.arguments.length === 1;
  if (!isIncludes || argument === undefined) {
    return undefined;
  }
  const constants = list.elements.flatMap((element) => {
    const value = constantOf(scope, element);
    return value === undefined ? [] : [value];
  });
  const valid = constants.length > 0 && constants.length === list.elements.length;
  return valid ? { subject: unwrap(argument), constants } : undefined;
}

export function subjectKey(subject: Node): string {
  return subject.getText().replaceAll(/\s+/gu, '').replaceAll('?.', '.').replaceAll('!', '');
}

export function conditionArm(scope: Checked, condition: Node): Arm | undefined {
  const pending = [unwrap(condition)];
  const parts: { at: number; arm: Arm | undefined }[] = [];
  for (const node of pending) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      pending.push(unwrap(node.left), unwrap(node.right));
    } else {
      parts.push({ at: node.pos, arm: equalityArm(scope, node) ?? membershipArm(scope, node) });
    }
  }
  const arms = parts.toSorted((left, right) => left.at - right.at).map(({ arm }) => arm);
  const defined = arms.filter((arm) => arm !== undefined);
  const [first] = defined;
  const same =
    first !== undefined &&
    defined.length === arms.length &&
    defined.every((arm) => subjectKey(arm.subject) === subjectKey(first.subject));
  return same
    ? {
        subject: first.subject,
        constants: [...new Set(defined.flatMap(({ constants }) => constants))],
      }
    : undefined;
}
