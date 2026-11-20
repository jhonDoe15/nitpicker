import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calleeName } from '../../test-assertions/dropped-callback/no-dropped-test-callback.mts';

type MessageId = 'wallClockElapsed';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const RELATIONS = new Set(['<', '>', '<=', '>=']);
const RECORDERS = /^(?:record|observe|timing|histogram|distribution|setTimeout)/iu;
const START_NAME = /start|begin|began|t0/iu;
const GESTURE_LIMIT = /hold|tap|press|click|gesture|debounce|double/iu;

function isDateNew(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0
  );
}

function isWallRead(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === '+' && isDateNew(node.argument);
  }
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const { object, property } = node.callee;
  if (property.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const nowCall =
    object.type === AST_NODE_TYPES.Identifier && object.name === 'Date' && property.name === 'now';
  return (
    nowCall || (isDateNew(object) && (property.name === 'getTime' || property.name === 'valueOf'))
  );
}

function variableOf(
  context: Context,
  node: TSESTree.Identifier,
): TSESLint.Scope.Variable | undefined {
  return (
    context.sourceCode.getScope(node).references.find(({ identifier }) => identifier === node)
      ?.resolved ?? undefined
  );
}

function isWallValue(context: Context, node: TSESTree.Node): boolean {
  if (isWallRead(node)) {
    return true;
  }
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const [definition] = variableOf(context, node)?.defs ?? [];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator
      ? (definition.node.init ?? undefined)
      : undefined;
  return init !== undefined && isWallRead(init);
}

function differenceOf(node: TSESTree.Node): TSESTree.BinaryExpression | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.BinaryExpression &&
    parent.operator === '-' &&
    parent.right === node
    ? parent
    : undefined;
}

function isGestureLimit({ left, right }: TSESTree.BinaryExpression, node: TSESTree.Node): boolean {
  return GESTURE_LIMIT.test(calleeName(left === node ? right : left));
}

function recorderName(call: TSESTree.CallExpression): string {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : '';
}

function usedAsLimit(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.BinaryExpression) {
    return RELATIONS.has(parent.operator) && !isGestureLimit(parent, node);
  }
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === node) &&
    RECORDERS.test(recorderName(parent))
  );
}

function reachesSink(context: Context, difference: TSESTree.BinaryExpression): boolean {
  if (usedAsLimit(difference)) {
    return true;
  }
  const { parent } = difference;
  if (
    parent.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const variable = context.sourceCode.getDeclaredVariables(parent)[0];
  return (
    variable?.references.some(
      (reference) => reference.isRead() && usedAsLimit(reference.identifier),
    ) ?? false
  );
}

function fieldName(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.ThisExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
    ? node.property.name
    : undefined;
}

function isInsideFunction(context: Context, node: TSESTree.Node): boolean {
  return context.sourceCode
    .getAncestors(node)
    .some(
      (each) =>
        each.type === AST_NODE_TYPES.FunctionDeclaration ||
        each.type === AST_NODE_TYPES.FunctionExpression ||
        each.type === AST_NODE_TYPES.ArrowFunctionExpression,
    );
}

function checkLocal(context: Context, node: TSESTree.VariableDeclarator): void {
  if (node.id.type !== AST_NODE_TYPES.Identifier || node.init === null || !isWallRead(node.init)) {
    return;
  }
  const variable = context.sourceCode.getDeclaredVariables(node)[0];
  const reads = variable?.references.filter((reference) => reference.isRead()) ?? [];
  const differences = reads.map(({ identifier }) => differenceOf(identifier));
  const pure = differences.every(
    (difference) => difference !== undefined && isWallValue(context, difference.left),
  );
  const sunk = differences.some(
    (difference) => difference !== undefined && reachesSink(context, difference),
  );
  if (reads.length > 0 && pure && sunk && isInsideFunction(context, node)) {
    context.report({ node, messageId: 'wallClockElapsed', data: { name: node.id.name } });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: { description: 'Measure elapsed time and timeouts with a monotonic clock' },
    schema: [],
    messages: {
      wallClockElapsed:
        '`{{name}}` is read from the wall clock and the elapsed time is compared or ' +
        'recorded, but the clock jumps with NTP corrections, so a timeout fires early or ' +
        'never and a duration turns negative; use `performance.now()`.',
    },
  },
  create(context) {
    const stamped = new Set<string>();
    const elapsed: { readonly name: string; readonly node: TSESTree.BinaryExpression }[] = [];
    return {
      'Program:exit'() {
        for (const { name, node } of elapsed) {
          if (stamped.has(name) && reachesSink(context, node)) {
            context.report({ node, messageId: 'wallClockElapsed', data: { name: `this.${name}` } });
          }
        }
      },
      AssignmentExpression(node) {
        const name = fieldName(node.left);
        if (
          name !== undefined &&
          START_NAME.test(name) &&
          node.operator === '=' &&
          isWallRead(node.right)
        ) {
          stamped.add(name);
        }
      },
      BinaryExpression(node) {
        const name = node.operator === '-' ? fieldName(node.right) : undefined;
        if (name !== undefined && isWallRead(node.left)) {
          elapsed.push({ name, node });
        }
      },
      VariableDeclarator(node) {
        checkLocal(context, node);
      },
    };
  },
};
