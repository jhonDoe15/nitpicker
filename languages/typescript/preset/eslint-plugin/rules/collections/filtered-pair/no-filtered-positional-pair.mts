import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import {
  calleeNameOf,
  isCallback,
  TYPE_WRAPPERS,
  unwrapOf,
  type Callback,
} from '../../typed/syntax-views.mts';
import { isFilteredExpression, isSameArray } from './filtered-origin.mts';
import { indexedAccessesOf, type IndexedAccess } from './indexed-access.mts';

type MessageId = 'filteredPositionalPair';
type RuleContext = TSESLint.RuleContext<MessageId, readonly unknown[]>;

type PairingCall = {
  readonly receiver: TSESTree.Expression;
  readonly callback: Callback;
  readonly indexPosition: number;
};

type CallbackContext = {
  readonly receiver: TSESTree.Expression;
  readonly receiverFiltered: boolean;
  readonly arrayVariable: TSESLint.Scope.Variable | undefined;
};

const CALLBACK_INDEX_POSITIONS = new Map<string, number>([
  ['forEach', 1],
  ['flatMap', 1],
  ['map', 1],
  ['reduce', 2],
  ['reduceRight', 2],
]);

function extractPairingCall(node: TSESTree.CallExpression): PairingCall | undefined {
  const callee = unwrapOf(node.callee, TYPE_WRAPPERS);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = calleeNameOf(callee);
  const indexPosition = method === undefined ? undefined : CALLBACK_INDEX_POSITIONS.get(method);
  const [firstArg] = node.arguments;
  return indexPosition !== undefined && isCallback(firstArg)
    ? { receiver: callee.object, callback: firstArg, indexPosition }
    : undefined;
}

function formalParameters(callback: Callback): TSESTree.Parameter[] {
  return callback.params.filter(
    (param) => param.type !== AST_NODE_TYPES.Identifier || param.name !== 'this',
  );
}

function parameterIdentifier(
  param: TSESTree.Parameter | undefined,
): TSESTree.Identifier | undefined {
  const target = param?.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param;
  return target?.type === AST_NODE_TYPES.Identifier ? target : undefined;
}

function isSameVariable(
  context: SourceContext,
  node: TSESTree.Node,
  target: TSESLint.Scope.Variable | undefined,
): boolean {
  if (target === undefined) {
    return false;
  }
  const unwrappedNode = unwrapOf(node, TYPE_WRAPPERS);
  return (
    unwrappedNode.type === AST_NODE_TYPES.Identifier &&
    findVariable(context, unwrappedNode, unwrappedNode.name) === target
  );
}

function isMismatchedCallbackAccess(
  context: SourceContext,
  info: CallbackContext,
  item: IndexedAccess,
): boolean {
  if (
    isSameArray(context, info.receiver, item.array) ||
    isSameVariable(context, item.array, info.arrayVariable)
  ) {
    return false;
  }
  return isFilteredExpression(context, item.array, item.access.range[0]) !== info.receiverFiltered;
}

function checkCallbackCall(context: RuleContext, node: TSESTree.CallExpression): void {
  const pairing = extractPairingCall(node);
  if (pairing === undefined) {
    return;
  }
  const params = formalParameters(pairing.callback);
  const indexId = parameterIdentifier(params[pairing.indexPosition]);
  if (indexId === undefined) {
    return;
  }
  const indexVar = findVariable(context, indexId, indexId.name);
  if (indexVar === undefined) {
    return;
  }
  const arrayId = parameterIdentifier(params[pairing.indexPosition + 1]);
  const info: CallbackContext = {
    receiver: pairing.receiver,
    receiverFiltered: isFilteredExpression(context, pairing.receiver, node.range[0]),
    arrayVariable: arrayId === undefined ? undefined : findVariable(context, arrayId, arrayId.name),
  };
  const accesses = indexedAccessesOf(indexVar, pairing.callback.body);
  if (accesses.some((item) => isMismatchedCallbackAccess(context, info, item))) {
    context.report({ node, messageId: 'filteredPositionalPair' });
  }
}

function isUpdatedIdentifier(update: TSESTree.Expression | null, name: string): boolean {
  if (update === null) {
    return false;
  }
  if (update.type === AST_NODE_TYPES.UpdateExpression) {
    return update.argument.type === AST_NODE_TYPES.Identifier && update.argument.name === name;
  }
  if (update.type === AST_NODE_TYPES.AssignmentExpression) {
    return update.left.type === AST_NODE_TYPES.Identifier && update.left.name === name;
  }
  return (
    update.type === AST_NODE_TYPES.SequenceExpression &&
    update.expressions.some((expr) => isUpdatedIdentifier(expr, name))
  );
}

function initIdentifier(init: TSESTree.ForStatement['init']): TSESTree.Identifier | undefined {
  if (init?.type === AST_NODE_TYPES.VariableDeclaration) {
    const first = init.declarations[0];
    return first?.id.type === AST_NODE_TYPES.Identifier && first.init !== null
      ? first.id
      : undefined;
  }
  return init?.type === AST_NODE_TYPES.AssignmentExpression &&
    init.left.type === AST_NODE_TYPES.Identifier
    ? init.left
    : undefined;
}

function loopIndexIdentifier(node: TSESTree.ForStatement): TSESTree.Identifier | undefined {
  const id = initIdentifier(node.init);
  return id !== undefined && isUpdatedIdentifier(node.update, id.name) ? id : undefined;
}

function hasMismatchedLoopPair(
  context: SourceContext,
  accesses: readonly IndexedAccess[],
): boolean {
  const filtered = accesses.filter((item) =>
    isFilteredExpression(context, item.array, item.access.range[0]),
  );
  const unfiltered = accesses.filter(
    (item) => !isFilteredExpression(context, item.array, item.access.range[0]),
  );
  return filtered.some((left) =>
    unfiltered.some((right) => !isSameArray(context, left.array, right.array)),
  );
}

function checkForLoop(context: RuleContext, node: TSESTree.ForStatement): void {
  const indexId = loopIndexIdentifier(node);
  if (indexId === undefined) {
    return;
  }
  const indexVar = findVariable(context, indexId, indexId.name);
  if (indexVar === undefined) {
    return;
  }
  const accesses = indexedAccessesOf(indexVar, node.body);
  if (hasMismatchedLoopPair(context, accesses)) {
    context.report({ node, messageId: 'filteredPositionalPair' });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow pairing a filtered list by position with an unfiltered list',
    },
    schema: [],
    messages: {
      filteredPositionalPair:
        'After .filter(), element positions no longer line up with the unfiltered list. Pair the lists first and filter the pairs, or keep a placeholder for dropped entries.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        checkCallbackCall(context, node);
      },
      ForStatement(node) {
        checkForLoop(context, node);
      },
    };
  },
};
