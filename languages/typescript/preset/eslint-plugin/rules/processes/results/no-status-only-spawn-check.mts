import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { chainOf, nameOf } from '../../typed/node-views.mts';
import { calleeMethod, trackedBindings } from '../process-callees.mts';
import { literalOption } from '../output/process-options.mts';
import { resultFieldUses, type FieldUse } from './result-fields.mts';

type MessageIds = 'exitWithNull' | 'nullInMessage' | 'nullAsSuccess';

const NUMBER_CHECKS = new Set(['isInteger', 'isFinite', 'isSafeInteger']);
type Shape = { readonly status: string; readonly causes: ReadonlySet<string> };

const NODE_SHAPE: Shape = { status: 'status', causes: new Set(['error', 'signal']) };
const EXECA_SHAPE: Shape = {
  status: 'exitCode',
  causes: new Set([
    'failed',
    'signal',
    'timedOut',
    'isTerminated',
    'isCanceled',
    'killed',
    'isForcefullyTerminated',
    'cause',
  ]),
};
const EXECA_CALLS = new Set([
  'execa',
  'execaSync',
  'execaCommand',
  'execaCommandSync',
  'execaNode',
]);
const RELATIONAL = new Set(['<', '<=', '>', '>=']);
const TEST_PARENTS = new Set([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

function shapeOf(
  context: SourceContext,
  call: TSESTree.CallExpression,
  method: string,
): Shape | undefined {
  if (method === 'spawnSync') {
    return NODE_SHAPE;
  }
  if (!EXECA_CALLS.has(method)) {
    return undefined;
  }
  const options = call.arguments.at(-1);
  return options?.type === AST_NODE_TYPES.ObjectExpression &&
    literalOption(context, options, 'reject') === false
    ? EXECA_SHAPE
    : undefined;
}

function isProcessMember(node: TSESTree.Node, name: string): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.object) === 'process' &&
    nameOf(node.property) === name
  );
}

function isTextOperand(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string')
  );
}

function logicalParent(node: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.LogicalExpression && parent.operator !== '??'
    ? parent
    : undefined;
}

function inTest(node: TSESTree.Node): boolean {
  if (node.parent?.type === AST_NODE_TYPES.UnaryExpression && node.parent.operator === '!') {
    return true;
  }
  const top = chainOf(node, logicalParent).at(-1) ?? node;
  const { parent } = top;
  if (parent === undefined) {
    return false;
  }
  if (TEST_PARENTS.has(parent.type)) {
    return 'test' in parent && parent.test === top;
  }
  return parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!';
}

function misuse(node: TSESTree.Node): MessageIds | undefined {
  const { parent } = node;
  if (parent === undefined) {
    return undefined;
  }
  if (
    (parent.type === AST_NODE_TYPES.CallExpression &&
      isProcessMember(parent.callee, 'exit') &&
      parent.arguments[0] === node) ||
    (parent.type === AST_NODE_TYPES.AssignmentExpression &&
      parent.right === node &&
      isProcessMember(parent.left, 'exitCode'))
  ) {
    return 'exitWithNull';
  }
  if (
    parent.type === AST_NODE_TYPES.TemplateLiteral ||
    (parent.type === AST_NODE_TYPES.BinaryExpression &&
      parent.operator === '+' &&
      isTextOperand(parent.left === node ? parent.right : parent.left))
  ) {
    return 'nullInMessage';
  }
  const relational =
    parent.type === AST_NODE_TYPES.BinaryExpression && RELATIONAL.has(parent.operator);
  return relational || inTest(node) ? 'nullAsSuccess' : undefined;
}

function isNothing(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

function checksNull(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.LogicalExpression) {
    return parent.operator === '??' && parent.left === node;
  }
  if (parent?.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === 'typeof';
  }
  if (parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === node) {
    return NUMBER_CHECKS.has(
      nameOf(
        parent.callee.type === AST_NODE_TYPES.MemberExpression
          ? parent.callee.property
          : parent.callee,
      ) ?? '',
    );
  }
  return (
    parent?.type === AST_NODE_TYPES.BinaryExpression &&
    isNothing(parent.left === node ? parent.right : parent.left)
  );
}

function statusMisuse(
  uses: readonly FieldUse[],
  shape: Shape,
): (FieldUse & { readonly id: MessageIds }) | undefined {
  const statuses = uses.filter(({ field }) => field === shape.status);
  if (
    uses.some(({ field }) => shape.causes.has(field)) ||
    statuses.some(({ node }) => checksNull(node))
  ) {
    return undefined;
  }
  for (const use of statuses) {
    const id = misuse(use.node);
    if (id !== undefined) {
      return { ...use, id };
    }
  }
  return undefined;
}

const CASES =
  'A child that could not start, ran past its timeout, wrote more than maxBuffer or was killed by a signal (the out-of-memory killer included) gives {{status}}: null with error or signal set, and this code reads neither.';

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow judging a spawnSync result by its exit status alone' },
    schema: [],
    messages: {
      exitWithNull: `${CASES} process.exit(null) and process.exitCode = null exit with code 0, so this program reports success for a child that never finished. Handle result.error and result.signal first, then exit with the status (result.status ?? 1).`,
      nullInMessage: `${CASES} The message then says "exited with null" and gives no cause. Handle result.error and result.signal first and put them in the message.`,
      nullAsSuccess: `${CASES} This test puts null on the same side as exit code 0, so a child that never finished is taken as a success. Handle result.error and result.signal first, or compare with !== 0 / === 0 so null counts as a failure.`,
    },
  },
  create(context) {
    return trackedBindings('promisified-imports', (current) => ({
      CallExpression(node) {
        const method = calleeMethod(node.callee, current());
        const shape = method === undefined ? undefined : shapeOf(context, node, method);
        const uses = shape === undefined ? undefined : resultFieldUses(context, node);
        const found =
          uses === undefined || shape === undefined ? undefined : statusMisuse(uses, shape);
        if (found !== undefined && shape !== undefined) {
          context.report({ node: found.node, messageId: found.id, data: { status: shape.status } });
        }
      },
    }));
  },
};
