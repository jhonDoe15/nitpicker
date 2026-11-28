import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { optionalText, textOf } from '../../../../../../shared/values/readers.mts';
import { operandsOf } from '../typed/syntax-views.mts';
import { ancestorsOf, memberRoot, nameOf, scopeChain } from '../typed/node-views.mts';

const EXIT_STATEMENTS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);
const TYPE_PROPERTIES = new Set(['type', 'nodeType']);

export function literalText(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0 ? optionalText(node.quasis[0]?.value.cooked) : undefined;
  }
  return node?.type === AST_NODE_TYPES.Literal ? optionalText(node.value) : undefined;
}

type Receiver = { readonly text: string; readonly sourceCode: TSESLint.SourceCode };
type Comparison = { readonly joiner: string; readonly operator: string };
type Narrowing = { readonly types: string[]; readonly start: number };

function isTypeOf(node: TSESTree.Node, receiver: Receiver): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    TYPE_PROPERTIES.has(textOf(nameOf(node.property))) &&
    receiver.sourceCode.getText(node.object) === receiver.text
  );
}

function comparedType(
  operand: TSESTree.Node,
  operator: string,
  receiver: Receiver,
): string | undefined {
  if (operand.type !== AST_NODE_TYPES.BinaryExpression || operand.operator !== operator) {
    return undefined;
  }
  const [member, other] = isTypeOf(operand.left, receiver)
    ? [operand.left, operand.right]
    : [operand.right, operand.left];
  return isTypeOf(member, receiver) ? literalText(other) : undefined;
}

function typeInTest(
  test: TSESTree.Node,
  comparison: Comparison,
  receiver: Receiver,
): string | undefined {
  for (const operand of operandsOf(test, comparison.joiner)) {
    const type = comparedType(operand, comparison.operator, receiver);
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  const root = memberRoot(node);
  return root.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

type Assignment = {
  readonly receiver: TSESTree.Node;
  readonly at: TSESTree.Node;
  readonly range: readonly [number, number];
};

function assignedBetween(sourceCode: TSESLint.SourceCode, assignment: Assignment): boolean {
  const name = rootName(assignment.receiver);
  if (name === undefined) {
    return false;
  }
  const { range } = assignment;
  const variable = scopeChain(sourceCode.getScope(assignment.at))
    .map((scope) => scope.set.get(name))
    .find((candidate) => candidate !== undefined);
  return (
    variable?.references.some(
      (reference) =>
        reference.isWrite() &&
        reference.identifier.range[0] >= range[0] &&
        reference.identifier.range[1] <= range[1],
    ) ?? false
  );
}

function exits(statement: TSESTree.Statement): boolean {
  const chain = [statement];
  for (const current of chain) {
    const last = current.type === AST_NODE_TYPES.BlockStatement ? current.body.at(-1) : undefined;
    if (last !== undefined) {
      chain.push(last);
    }
  }
  const final = chain.at(-1);
  return final !== undefined && EXIT_STATEMENTS.has(final.type);
}

function exitGuard(
  statement: TSESTree.Statement,
  receiver: Receiver,
): { type: string; end: number } | undefined {
  if (
    statement.type !== AST_NODE_TYPES.IfStatement ||
    statement.alternate !== null ||
    !exits(statement.consequent)
  ) {
    return undefined;
  }
  const type = typeInTest(statement.test, { joiner: '||', operator: '!==' }, receiver);
  return type === undefined ? undefined : { type, end: statement.range[1] };
}

function earlyExitType(
  block: TSESTree.BlockStatement,
  child: TSESTree.Node,
  receiver: Receiver,
): { type: string; end: number } | undefined {
  for (const statement of block.body) {
    if (statement.range[0] >= child.range[0]) {
      return undefined;
    }
    const guard = exitGuard(statement, receiver);
    if (guard !== undefined) {
      return guard;
    }
  }
  return undefined;
}

function switchTypes(switchCase: TSESTree.SwitchCase, receiver: Receiver): string[] {
  const switchNode = switchCase.parent;
  if (!isTypeOf(switchNode.discriminant, receiver)) {
    return [];
  }
  const index = switchNode.cases.indexOf(switchCase);
  const types: string[] = [];
  for (const [offset, current] of switchNode.cases
    .slice(0, index + 1)
    .reverse()
    .entries()) {
    const text = literalText(current.test ?? undefined);
    if (text === undefined || (offset > 0 && current.consequent.length > 0)) {
      return offset === 0 ? [] : types;
    }
    types.push(text);
  }
  return types;
}

function guardingTest(parent: TSESTree.Node, child: TSESTree.Node): TSESTree.Node | undefined {
  if (
    (parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression) &&
    parent.consequent === child
  ) {
    return parent.test;
  }
  const guardedByAnd =
    parent.type === AST_NODE_TYPES.LogicalExpression &&
    parent.operator === '&&' &&
    parent.right === child;
  return guardedByAnd ? parent.left : undefined;
}

function conditionType(
  parent: TSESTree.Node,
  child: TSESTree.Node,
  receiver: Receiver,
): Narrowing | undefined {
  const test = guardingTest(parent, child);
  const type =
    test === undefined ? undefined : typeInTest(test, { joiner: '&&', operator: '===' }, receiver);
  return type === undefined ? undefined : { types: [type], start: child.range[0] };
}

function narrowingAt(
  parent: TSESTree.Node,
  child: TSESTree.Node,
  receiver: Receiver,
): Narrowing | undefined {
  if (parent.type === AST_NODE_TYPES.SwitchCase) {
    const inBody = parent.consequent.some((statement) => statement === child);
    const types = inBody ? switchTypes(parent, receiver) : [];
    return types.length > 0 ? { types, start: parent.range[0] } : undefined;
  }
  if (parent.type === AST_NODE_TYPES.BlockStatement) {
    const early = earlyExitType(parent, child, receiver);
    return early === undefined ? undefined : { types: [early.type], start: early.end };
  }
  return conditionType(parent, child, receiver);
}

export function narrowedTypes(
  node: TSESTree.Node,
  receiverNode: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string[] {
  const receiver: Receiver = { text: sourceCode.getText(receiverNode), sourceCode };
  const chain = [node, ...ancestorsOf(node)];
  for (const [index, parent] of chain.entries()) {
    const child = chain[index - 1];
    if (child === undefined || parent.type === AST_NODE_TYPES.Program) {
      continue;
    }
    const found = narrowingAt(parent, child, receiver);
    const range: [number, number] = [found?.start ?? 0, node.range[0]];
    if (
      found !== undefined &&
      !assignedBetween(sourceCode, { receiver: receiverNode, at: node, range })
    ) {
      return found.types;
    }
  }
  return [];
}
