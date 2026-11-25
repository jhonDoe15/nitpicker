import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf, contains, nameOf } from '../../typed/node-views.mts';
import { isFunction, operandsOf, unwrapped } from '../../typed/syntax-views.mts';

const EXIT_STATEMENTS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

export function receiverKeyOf(node: TSESTree.Node): string | undefined {
  const chain = chainOf(unwrapped(node), (link) =>
    link.type === AST_NODE_TYPES.MemberExpression && !link.computed
      ? unwrapped(link.object)
      : undefined,
  );
  const parts: string[] = [];
  for (const link of chain.toReversed()) {
    const part =
      link.type === AST_NODE_TYPES.MemberExpression ? nameOf(link.property) : nameOf(link);
    if (part === undefined) {
      return undefined;
    }
    parts.push(part);
  }
  return parts.length === 0 ? undefined : parts.join('.');
}

function isTypePropertyOf(node: TSESTree.Node, receiverKey: string): boolean {
  const plain = unwrapped(node);
  return (
    plain.type === AST_NODE_TYPES.MemberExpression &&
    !plain.computed &&
    nameOf(plain.property) === 'type' &&
    receiverKeyOf(plain.object) === receiverKey
  );
}

function typeCheckValue(
  expression: TSESTree.Node,
  receiverKey: string,
  negated: boolean,
): string | undefined {
  const plain = unwrapped(expression);
  if (plain.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const matchesOp = negated
    ? plain.operator === '!==' || plain.operator === '!='
    : plain.operator === '===' || plain.operator === '==';
  if (!matchesOp) {
    return undefined;
  }
  if (isTypePropertyOf(plain.left, receiverKey)) {
    return stringValue(unwrapped(plain.right));
  }
  return isTypePropertyOf(plain.right, receiverKey)
    ? stringValue(unwrapped(plain.left))
    : undefined;
}

function disjunctTypes(
  expression: TSESTree.Node,
  receiverKey: string,
  negated: boolean,
): readonly string[] | undefined {
  const plain = unwrapped(expression);
  if (plain.type === AST_NODE_TYPES.UnaryExpression && plain.operator === '!') {
    return disjunctTypes(plain.argument, receiverKey, !negated);
  }
  const operands = operandsOf(plain, negated ? '&&' : '||');
  const types: string[] = [];
  for (const operand of operands) {
    const value = typeCheckValue(operand, receiverKey, negated);
    if (value === undefined) {
      return undefined;
    }
    types.push(value);
  }
  return types.length === 0 ? undefined : types;
}

function narrowedByCondition(
  test: TSESTree.Node,
  receiverKey: string,
  negated: boolean,
): readonly string[] | undefined {
  const operands = operandsOf(unwrapped(test), negated ? '||' : '&&');
  for (const operand of operands) {
    const found = disjunctTypes(operand, receiverKey, negated);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function fallthroughCases(
  cases: readonly TSESTree.SwitchCase[],
  index: number,
): readonly TSESTree.SwitchCase[] {
  const start = cases[index];
  if (start === undefined) {
    return [];
  }
  const collected: TSESTree.SwitchCase[] = [start];
  for (let current = index - 1; current >= 0; current -= 1) {
    const branch = cases[current];
    if (branch === undefined || branch.consequent.length > 0) {
      break;
    }
    collected.push(branch);
  }
  return collected;
}

function switchCaseTypes(
  switchCase: TSESTree.SwitchCase,
  receiverKey: string,
): readonly string[] | undefined {
  const { parent } = switchCase;
  if (!isTypePropertyOf(parent.discriminant, receiverKey)) {
    return undefined;
  }
  const index = parent.cases.indexOf(switchCase);
  if (index < 0) {
    return undefined;
  }
  const types: string[] = [];
  for (const branch of fallthroughCases(parent.cases, index)) {
    const value = branch.test === null ? undefined : stringValue(unwrapped(branch.test));
    if (value === undefined) {
      return undefined;
    }
    types.push(value);
  }
  return types;
}

function exitsBlock(statement: TSESTree.Node): boolean {
  const chain = chainOf(statement, (current) =>
    current.type === AST_NODE_TYPES.BlockStatement ? current.body.at(-1) : undefined,
  );
  return EXIT_STATEMENTS.has(chain.at(-1)?.type ?? '');
}

function earlyExitTypes(
  block: TSESTree.BlockStatement,
  node: TSESTree.Node,
  receiverKey: string,
): readonly string[] | undefined {
  const index = block.body.findIndex((statement) => contains(statement, node));
  if (index <= 0) {
    return undefined;
  }
  for (const statement of block.body.slice(0, index).toReversed()) {
    const isGuard =
      statement.type === AST_NODE_TYPES.IfStatement &&
      statement.alternate === null &&
      exitsBlock(statement.consequent);
    const narrowed = isGuard ? narrowedByCondition(statement.test, receiverKey, true) : undefined;
    if (narrowed !== undefined) {
      return narrowed;
    }
  }
  return undefined;
}

function narrowedByBranch(
  ancestor: TSESTree.IfStatement | TSESTree.ConditionalExpression,
  node: TSESTree.Node,
  receiverKey: string,
): readonly string[] | undefined {
  if (contains(ancestor.consequent, node)) {
    return narrowedByCondition(ancestor.test, receiverKey, false);
  }
  if (ancestor.alternate !== null && contains(ancestor.alternate, node)) {
    return narrowedByCondition(ancestor.test, receiverKey, true);
  }
  return undefined;
}

function narrowedByLogical(
  ancestor: TSESTree.LogicalExpression,
  node: TSESTree.Node,
  receiverKey: string,
): readonly string[] | undefined {
  if (!contains(ancestor.right, node)) {
    return undefined;
  }
  if (ancestor.operator === '&&') {
    return narrowedByCondition(ancestor.left, receiverKey, false);
  }
  return ancestor.operator === '||'
    ? narrowedByCondition(ancestor.left, receiverKey, true)
    : undefined;
}

function narrowedByAncestor(
  ancestor: TSESTree.Node,
  node: TSESTree.Node,
  receiverKey: string,
): readonly string[] | undefined {
  if (
    ancestor.type === AST_NODE_TYPES.IfStatement ||
    ancestor.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return narrowedByBranch(ancestor, node, receiverKey);
  }
  if (ancestor.type === AST_NODE_TYPES.LogicalExpression) {
    return narrowedByLogical(ancestor, node, receiverKey);
  }
  if (ancestor.type === AST_NODE_TYPES.SwitchCase) {
    return switchCaseTypes(ancestor, receiverKey);
  }
  return ancestor.type === AST_NODE_TYPES.BlockStatement
    ? earlyExitTypes(ancestor, node, receiverKey)
    : undefined;
}

export function narrowedNodeTypes(
  node: TSESTree.Node,
  receiverKey: string,
): readonly string[] | undefined {
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) {
      return undefined;
    }
    const narrowed = narrowedByAncestor(ancestor, node, receiverKey);
    if (narrowed !== undefined) {
      return narrowed;
    }
  }
  return undefined;
}
