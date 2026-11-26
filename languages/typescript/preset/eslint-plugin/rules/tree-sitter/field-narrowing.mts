import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { operandsOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

const TYPE_PROPERTIES = new Set(['type', 'nodeType']);

export function literalText(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function isTypeOf(node: TSESTree.Node, receiverText: string, sourceCode: TSESLint.SourceCode) {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    TYPE_PROPERTIES.has(nameOf(node.property) ?? '') &&
    sourceCode.getText(node.object) === receiverText
  );
}

function comparedType(
  operand: TSESTree.Node,
  operator: string,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): string | undefined {
  if (operand.type !== AST_NODE_TYPES.BinaryExpression || operand.operator !== operator) {
    return undefined;
  }
  const [member, other] = isTypeOf(operand.left, receiverText, sourceCode)
    ? [operand.left, operand.right]
    : [operand.right, operand.left];
  return isTypeOf(member, receiverText, sourceCode) ? literalText(other) : undefined;
}

function typeInTest(
  test: TSESTree.Node,
  joiner: string,
  operator: string,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): string | undefined {
  for (const operand of operandsOf(test, joiner)) {
    const type = comparedType(operand, operator, receiverText, sourceCode);
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current.name : undefined;
}

function assignedBetween(
  sourceCode: TSESLint.SourceCode,
  receiver: TSESTree.Node,
  at: TSESTree.Node,
  range: readonly [number, number],
): boolean {
  const name = rootName(receiver);
  if (name === undefined) {
    return false;
  }
  for (
    let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(at);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name);
    if (variable !== undefined) {
      return variable.references.some(
        (reference) =>
          reference.isWrite() &&
          reference.identifier.range[0] >= range[0] &&
          reference.identifier.range[1] <= range[1],
      );
    }
  }
  return false;
}

function exits(statement: TSESTree.Statement): boolean {
  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
    case AST_NODE_TYPES.ContinueStatement:
    case AST_NODE_TYPES.BreakStatement:
      return true;
    case AST_NODE_TYPES.BlockStatement:
      return statement.body.at(-1) !== undefined && exits(statement.body.at(-1)!);
    default:
      return false;
  }
}

function earlyExitType(
  block: TSESTree.BlockStatement,
  child: TSESTree.Node,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): { type: string; end: number } | undefined {
  for (const statement of block.body) {
    if (statement.range[0] >= child.range[0]) {
      return undefined;
    }
    if (
      statement.type === AST_NODE_TYPES.IfStatement &&
      statement.alternate === null &&
      exits(statement.consequent)
    ) {
      const type = typeInTest(statement.test, '||', '!==', receiverText, sourceCode);
      if (type !== undefined) {
        return { type, end: statement.range[1] };
      }
    }
  }
  return undefined;
}

function switchTypes(
  switchCase: TSESTree.SwitchCase,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): string[] {
  const switchNode = switchCase.parent;
  const { discriminant } = switchNode;
  if (!isTypeOf(discriminant, receiverText, sourceCode)) {
    return [];
  }
  const index = switchNode.cases.indexOf(switchCase);
  const types: string[] = [];
  for (let at = index; at >= 0; at -= 1) {
    const current = switchNode.cases[at];
    const text = literalText(current?.test ?? undefined);
    if (
      current === undefined ||
      text === undefined ||
      (at < index && current.consequent.length > 0)
    ) {
      return at === index ? [] : types;
    }
    types.push(text);
  }
  return types;
}

function conditionType(
  parent: TSESTree.Node,
  child: TSESTree.Node,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): { types: string[]; start: number } | undefined {
  const guarded =
    ((parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression) &&
      parent.consequent === child) ||
    (parent.type === AST_NODE_TYPES.LogicalExpression &&
      parent.operator === '&&' &&
      parent.right === child);
  const condition = parent.type === AST_NODE_TYPES.LogicalExpression ? parent.left : undefined;
  const test = guarded ? (condition ?? ('test' in parent ? parent.test : undefined)) : undefined;
  const type =
    test === undefined || test === null
      ? undefined
      : typeInTest(test, '&&', '===', receiverText, sourceCode);
  return type === undefined ? undefined : { types: [type], start: child.range[0] };
}

export function narrowedTypes(
  node: TSESTree.Node,
  receiver: TSESTree.Node | undefined,
  sourceCode: TSESLint.SourceCode,
): string[] {
  if (receiver === undefined) {
    return [];
  }
  const receiverText = sourceCode.getText(receiver);
  let child: TSESTree.Node = node;
  for (
    let parent = child.parent;
    parent && parent.type !== AST_NODE_TYPES.Program;
    child = parent, parent = parent.parent
  ) {
    let found = conditionType(parent, child, receiverText, sourceCode);
    if (parent.type === AST_NODE_TYPES.SwitchCase && parent.consequent.includes(child as never)) {
      const types = switchTypes(parent, receiverText, sourceCode);
      found = types.length > 0 ? { types, start: parent.range[0] } : undefined;
    }
    if (parent.type === AST_NODE_TYPES.BlockStatement) {
      const early = earlyExitType(parent, child, receiverText, sourceCode);
      found = early === undefined ? undefined : { types: [early.type], start: early.end };
    }
    if (
      found !== undefined &&
      !assignedBetween(sourceCode, receiver, node, [found.start, node.range[0]])
    ) {
      return found.types;
    }
  }
  return [];
}
