import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, type SourceCode } from '../../../../typed/node-views.mts';
import { operandsOf } from '../../../../typed/syntax-views.mts';
import { someNode, unwrapped } from '../../repeated-runs.mts';
import { isSimpleValue } from '../simple-values.mts';
import { membershipOf } from './membership.mts';

type References = ReadonlySet<TSESTree.Node>;
type Meaning = { readonly element: TSESTree.Node; readonly present: boolean };

const EXITS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

function receiverOf(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const call = node.type === AST_NODE_TYPES.BinaryExpression ? unwrapped(node.left) : node;
  const callee = call.type === AST_NODE_TYPES.CallExpression ? unwrapped(call.callee) : undefined;
  const object = callee?.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  return object?.type === AST_NODE_TYPES.Identifier ? object : undefined;
}

function meaningOf(node: TSESTree.Node, references: References): Meaning | undefined {
  const inner = unwrapped(node);
  const chain = chainOf<TSESTree.Node>(inner, (link) =>
    link.type === AST_NODE_TYPES.UnaryExpression && link.operator === '!'
      ? unwrapped(link.argument)
      : undefined,
  );
  const negations = chain.length - 1;
  const current = chain.at(-1) ?? inner;
  const receiver = receiverOf(current);
  const membership =
    receiver !== undefined && references.has(receiver) ? membershipOf(receiver) : undefined;
  if (membership === undefined || membership.replaced !== current) {
    return undefined;
  }
  return { element: membership.element, present: membership.present === (negations % 2 === 0) };
}

function isExit(statement: TSESTree.Node | undefined): boolean {
  if (statement?.type === AST_NODE_TYPES.BlockStatement) {
    const [only] = statement.body;
    return statement.body.length === 1 && only !== undefined && EXITS.has(only.type);
  }
  return statement !== undefined && EXITS.has(statement.type);
}

function pushedStatement(push: TSESTree.CallExpression): TSESTree.ExpressionStatement | undefined {
  const holder = push.parent;
  if (holder.type === AST_NODE_TYPES.ExpressionStatement) {
    return holder;
  }
  const statement = holder.parent;
  return holder.type === AST_NODE_TYPES.LogicalExpression &&
    holder.operator === '&&' &&
    holder.right === push &&
    statement?.type === AST_NODE_TYPES.ExpressionStatement
    ? statement
    : undefined;
}

type Guard = {
  readonly sourceCode: SourceCode;
  readonly references: References;
  readonly text: string;
};

function changesValues(test: TSESTree.Node): boolean {
  return someNode(
    test,
    (node) =>
      node.type === AST_NODE_TYPES.AssignmentExpression ||
      node.type === AST_NODE_TYPES.UpdateExpression,
  );
}

type Mention = { readonly operator: string; readonly present: boolean };

function mentions(guard: Guard, test: TSESTree.Node, { operator, present }: Mention): boolean {
  if (changesValues(test)) {
    return false;
  }
  return operandsOf(test, operator).some((operand) => {
    const meaning = meaningOf(operand, guard.references);
    return meaning?.present === present && guard.sourceCode.getText(meaning.element) === guard.text;
  });
}

function guardingIf(statement: TSESTree.Node): TSESTree.IfStatement | undefined {
  const holder = statement.parent;
  if (holder?.type === AST_NODE_TYPES.IfStatement) {
    return holder.consequent === statement ? holder : undefined;
  }
  const owner = holder?.parent;
  return holder?.type === AST_NODE_TYPES.BlockStatement &&
    holder.body[0] === statement &&
    owner?.type === AST_NODE_TYPES.IfStatement &&
    owner.consequent === holder
    ? owner
    : undefined;
}

function blockGuard(guard: Guard, statement: TSESTree.Node): boolean {
  const owner = guardingIf(statement);
  if (owner !== undefined) {
    return mentions(guard, owner.test, { operator: '&&', present: false });
  }
  const holder = statement.parent;
  if (holder?.type !== AST_NODE_TYPES.BlockStatement && holder?.type !== AST_NODE_TYPES.Program) {
    return false;
  }
  const before = holder.body[holder.body.findIndex((item) => item === statement) - 1];
  return (
    before?.type === AST_NODE_TYPES.IfStatement &&
    before.alternate === null &&
    isExit(before.consequent) &&
    mentions(guard, before.test, { operator: '||', present: true })
  );
}

export function isGuardedPush(
  sourceCode: SourceCode,
  push: TSESTree.CallExpression,
  references: References,
): boolean {
  const [element] = push.arguments;
  const statement = pushedStatement(push);
  if (element === undefined || statement === undefined || !isSimpleValue(element)) {
    return false;
  }
  const guard = { sourceCode, references, text: sourceCode.getText(element) };
  if (push.parent.type === AST_NODE_TYPES.LogicalExpression) {
    return mentions(guard, push.parent.left, { operator: '&&', present: false });
  }
  return blockGuard(guard, statement);
}
