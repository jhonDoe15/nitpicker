import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import { depthFirst, nameOf } from '../typed/node-views.mts';
import { syntaxChildren } from '../decided/syntax.mts';
import { conditionRoot } from '../presence/conditions.mts';
import { isGuardedAgainstEmpty, isTrackedReceiver } from './every-receivers.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'emptyEvery';
type Scope = TypedScope<MessageIds>;

const SIGNAL_NAME = /^(?:all|every|each)(?:[A-Z0-9_]|$)/u;
const ACTIONS = [
  'stop',
  'finish',
  'finalize',
  'complete',
  'cancel',
  'delete',
  'remove',
  'send',
  'close',
  'end',
  'abort',
  'resolve',
  'dispose',
  'shutdown',
  'terminate',
  'kill',
];

function isAction(name: string): boolean {
  const words = name.split(/(?<=[a-z0-9])(?=[A-Z])|[_\W]+/u).map((word) => word.toLowerCase());
  return words.some((word) => ACTIONS.includes(word));
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

function everyCall(node: TSESTree.CallExpression): TSESTree.MemberExpression | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.property) === 'every' &&
    node.arguments.length === 1
    ? callee
    : undefined;
}

function assignedName(node: TSESTree.Node): string | undefined {
  const { parent } = node;
  if (parent === undefined) {
    return undefined;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node) {
    return nameOf(parent.id);
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node) {
    const { left } = parent;
    return nameOf(left.type === AST_NODE_TYPES.MemberExpression ? left.property : left);
  }
  return parent.type === AST_NODE_TYPES.Property && parent.value === node
    ? nameOf(parent.key)
    : undefined;
}

function callsAction(branch: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(branch, syntaxChildren)].some((node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const { callee } = node;
    const name = nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
    return name !== undefined && isAction(name);
  });
}

function isSignal(call: TSESTree.CallExpression): boolean {
  const node = call.parent?.type === AST_NODE_TYPES.ChainExpression ? call.parent : call;
  const name = assignedName(node);
  if (name !== undefined) {
    return SIGNAL_NAME.test(name);
  }
  const root = conditionRoot(node);
  const parent = root?.parent;
  return (
    parent !== undefined &&
    (parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression) &&
    parent.test === root &&
    callsAction(parent.consequent)
  );
}

function check(scope: Scope, node: TSESTree.CallExpression): void {
  const callee = everyCall(node);
  if (callee === undefined) {
    return;
  }
  const receiver = unwrap(callee.object);
  const { services, sourceCode } = scope;
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(receiver));
  if (
    checker.isArrayType(type) &&
    isTrackedReceiver(sourceCode, receiver) &&
    isSignal(node) &&
    !isGuardedAgainstEmpty(scope, node, receiver)
  ) {
    scope.context.report({
      node,
      messageId: 'emptyEvery',
      data: { list: sourceCode.getText(receiver) },
    });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Report every() over a list that can be empty used as an all-done signal',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      emptyEvery:
        '`{{list}}.every(...)` is true when `{{list}}` is empty, so this all-done signal fires ' +
        'when there are no items. Guard it with `{{list}}.length > 0 && {{list}}.every(...)`.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    return { CallExpression: (node: TSESTree.CallExpression) => check(scope, node) };
  },
};
