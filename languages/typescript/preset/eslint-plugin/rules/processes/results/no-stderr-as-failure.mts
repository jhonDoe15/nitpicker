import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { trackedBindings } from '../process-callees.mts';
import { orOperands } from '../../null-branches/null-targets.mts';
import { isStderrText } from './stderr-sources.mts';

type Branching = TSESTree.IfStatement | TSESTree.ConditionalExpression;
type Sources = Parameters<typeof isStderrText>[0];

const NOT_EMPTY = new Set(['!==', '!=', '>']);

function isZeroOrEmpty(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && (node.value === 0 || node.value === '');
}

function lengthOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    nameOf(node.property) === 'length'
    ? node.object
    : undefined;
}

function testedText(test: TSESTree.Node): TSESTree.Node | undefined {
  if (test.type === AST_NODE_TYPES.BinaryExpression && NOT_EMPTY.has(test.operator)) {
    if (!isZeroOrEmpty(test.right)) {
      return undefined;
    }
    return test.right.type === AST_NODE_TYPES.Literal && test.right.value === ''
      ? test.left
      : lengthOf(test.left);
  }
  return lengthOf(test) ?? test;
}

function isNonZeroExit(node: TSESTree.CallExpression): boolean {
  const [code] = node.arguments;
  return (
    nameOf(
      node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : node.callee,
    ) === 'process' &&
    nameOf(
      node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.property : undefined,
    ) === 'exit' &&
    code?.type === AST_NODE_TYPES.Literal &&
    code.value !== 0
  );
}

function isReject(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return nameOf(callee.object) === 'Promise' && nameOf(callee.property) === 'reject';
  }
  return nameOf(callee) === 'reject';
}

function statementValue(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.ExpressionStatement) {
    return node.expression;
  }
  return node.type === AST_NODE_TYPES.ReturnStatement ? (node.argument ?? undefined) : node;
}

function isFailing(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  const value = statementValue(node);
  return (
    value?.type === AST_NODE_TYPES.CallExpression &&
    (isReject(value.callee) || isNonZeroExit(value))
  );
}

function fails(branch: TSESTree.Node): boolean {
  return branch.type === AST_NODE_TYPES.BlockStatement
    ? branch.body.some(isFailing)
    : isFailing(branch);
}

function check(
  context: Readonly<TSESLint.RuleContext<'stderrAsFailure', []>>,
  sources: Sources,
  node: Branching,
): void {
  if (!fails(node.consequent)) {
    return;
  }
  for (const alternative of orOperands(node.test)) {
    const text = testedText(alternative);
    if (text !== undefined && isStderrText(sources, text)) {
      context.report({ node: alternative, messageId: 'stderrAsFailure' });
    }
  }
}

export const rule: TSESLint.RuleModule<'stderrAsFailure'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow treating any output on standard error as a failed subprocess' },
    schema: [],
    messages: {
      stderrAsFailure:
        'This treats any text on the standard error of a finished child process as a failure. Standard error also carries warnings, notices and progress: a JVM prints "Picked up JAVA_TOOL_OPTIONS" whenever that variable is set, Node.js prints deprecation warnings, package managers print update notices, so the check passes on one machine and fails in a container or CI image. Decide by the exit status (status !== 0, exitCode, the error of the callback) and keep standard error for the message.',
    },
  },
  create(context) {
    return trackedBindings('promisified-imports-and-aliases', (current) => ({
      IfStatement(node) {
        check(context, { context, bindings: current() }, node);
      },
      ConditionalExpression(node) {
        check(context, { context, bindings: current() }, node);
      },
    }));
  },
};
