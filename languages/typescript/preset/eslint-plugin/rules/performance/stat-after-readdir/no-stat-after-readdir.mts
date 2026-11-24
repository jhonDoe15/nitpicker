import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { inside } from '../../decided/syntax.mts';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isCallExpression, isCallback, unwrapOf, unwrapped } from '../../typed/syntax-views.mts';
import {
  EXPRESSION_WRAPPERS,
  readdirSourceOf,
  singleWriteInitializer,
} from './readdir-sources.mts';
import {
  isPathFromEntry,
  statCallName,
  usesOnlyDirentMethods,
  type EntryMatcher,
} from './stat-usage.mts';

type MessageId = 'statAfterReaddir';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

type RuleState = {
  readonly context: Context;
  readonly reported: Set<TSESTree.Node>;
};

type ScanTarget = {
  readonly body: TSESTree.Node;
  readonly entry: EntryMatcher;
  readonly readdirCall: string;
};

type IndexedBinding = {
  readonly collection: TSESTree.Identifier;
  readonly index: TSESTree.Identifier;
};

const ITERATING_METHODS = new Set(['forEach', 'map', 'filter', 'some', 'every', 'flatMap', 'find']);
const FORWARD_BOUNDS = new Set(['<', '<=', '!==', '!=']);
const REVERSE_BOUNDS = new Set(['>', '>=']);

function checkCandidate(state: RuleState, target: ScanTarget, node: TSESTree.Node): void {
  if (!isCallExpression(node) || state.reported.has(node)) {
    return;
  }
  const statCall = statCallName(node);
  const { sourceCode } = state.context;
  if (
    statCall === undefined ||
    !isPathFromEntry(sourceCode, node.arguments[0], target.entry) ||
    !usesOnlyDirentMethods(sourceCode, node)
  ) {
    return;
  }
  state.reported.add(node);
  state.context.report({
    node,
    messageId: 'statAfterReaddir',
    data: { statCall, readdirCall: target.readdirCall },
  });
}

function scanBody(state: RuleState, target: ScanTarget): void {
  for (const candidate of inside(target.body)) {
    checkCandidate(state, target, candidate);
  }
}

function forOfEntryVariable(
  sourceCode: SourceCode,
  left: TSESTree.ForOfStatement['left'],
): TSESLint.Scope.Variable | undefined {
  if (left.type === AST_NODE_TYPES.Identifier) {
    return variableNamed(sourceCode, left);
  }
  if (left.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const declarator = left.declarations.length === 1 ? left.declarations[0] : undefined;
  return declarator?.id.type === AST_NODE_TYPES.Identifier
    ? variableNamed(sourceCode, declarator.id)
    : undefined;
}

function lengthCollectionOf(
  sourceCode: SourceCode,
  expression: TSESTree.Node,
): TSESTree.Identifier | undefined {
  const plain = unwrapOf(expression, EXPRESSION_WRAPPERS);
  const resolved =
    plain.type === AST_NODE_TYPES.Identifier
      ? (singleWriteInitializer(sourceCode, plain) ?? plain)
      : plain;
  const candidate =
    resolved.type === AST_NODE_TYPES.BinaryExpression && resolved.operator === '-'
      ? unwrapOf(resolved.left, EXPRESSION_WRAPPERS)
      : unwrapOf(resolved, EXPRESSION_WRAPPERS);
  return candidate.type === AST_NODE_TYPES.MemberExpression &&
    !candidate.computed &&
    nameOf(candidate.property) === 'length' &&
    candidate.object.type === AST_NODE_TYPES.Identifier
    ? candidate.object
    : undefined;
}

function testIndexedBinding(
  sourceCode: SourceCode,
  test: TSESTree.Expression | null,
): IndexedBinding | undefined {
  if (test?.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const isForward = FORWARD_BOUNDS.has(test.operator);
  const isReverse = REVERSE_BOUNDS.has(test.operator);
  if (!isForward && !isReverse) {
    return undefined;
  }
  const indexNode = isForward ? test.left : test.right;
  const boundNode = isForward ? test.right : test.left;
  const collection = lengthCollectionOf(sourceCode, boundNode);
  return indexNode.type === AST_NODE_TYPES.Identifier && collection !== undefined
    ? { collection, index: indexNode }
    : undefined;
}

function initIndexedBinding(
  sourceCode: SourceCode,
  init: TSESTree.ForStatement['init'],
): IndexedBinding | undefined {
  if (init?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return undefined;
  }
  const declarator = init.declarations.find(
    (entry) => entry.id.type === AST_NODE_TYPES.Identifier && entry.init !== null,
  );
  if (declarator?.id.type !== AST_NODE_TYPES.Identifier || declarator.init === null) {
    return undefined;
  }
  const collection = lengthCollectionOf(sourceCode, declarator.init);
  return collection === undefined ? undefined : { collection, index: declarator.id };
}

function checkForStatement(state: RuleState, node: TSESTree.ForStatement): void {
  const { sourceCode } = state.context;
  const binding =
    testIndexedBinding(sourceCode, node.test) ?? initIndexedBinding(sourceCode, node.init);
  if (binding === undefined) {
    return;
  }
  const readdirCall = readdirSourceOf(state.context, binding.collection);
  const collection = variableNamed(sourceCode, binding.collection);
  const index = variableNamed(sourceCode, binding.index);
  if (readdirCall === undefined || collection === undefined || index === undefined) {
    return;
  }
  scanBody(state, {
    body: node.body,
    entry: { kind: 'indexed', collection, index },
    readdirCall,
  });
}

function checkCallbackCall(state: RuleState, node: TSESTree.CallExpression): void {
  const callee = unwrapped(node.callee);
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? nameOf(callee.property)
      : undefined;
  const callback = node.arguments[0];
  if (method === undefined || !ITERATING_METHODS.has(method) || !isCallback(callback)) {
    return;
  }
  const firstParam = callback.params[0];
  const paramNode =
    firstParam?.type === AST_NODE_TYPES.AssignmentPattern ? firstParam.left : firstParam;
  const entryVar =
    paramNode?.type === AST_NODE_TYPES.Identifier
      ? variableNamed(state.context.sourceCode, paramNode)
      : undefined;
  const readdirCall =
    callee.type === AST_NODE_TYPES.MemberExpression
      ? readdirSourceOf(state.context, callee.object)
      : undefined;
  if (entryVar === undefined || readdirCall === undefined) {
    return;
  }
  scanBody(state, {
    body: callback.body,
    entry: { kind: 'variable', variable: entryVar },
    readdirCall,
  });
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report calling stat/lstat per entry after readdir/readdirSync without withFileTypes: true when only file type checks are read',
    },
    schema: [],
    messages: {
      statAfterReaddir:
        'Calling `{{ statCall }}` on each entry from `{{ readdirCall }}` issues an extra `stat` ' +
        'system call per entry just to check its file type. Pass `{ withFileTypes: true }` to ' +
        '`{{ readdirCall }}` to get `Dirent` objects with `isDirectory()`, `isFile()`, and ' +
        '`isSymbolicLink()` without calling `{{ statCall }}`.',
    },
  },
  create(context) {
    const state: RuleState = { context, reported: new Set<TSESTree.Node>() };
    return {
      ForOfStatement(node: TSESTree.ForOfStatement) {
        const entryVar = forOfEntryVariable(context.sourceCode, node.left);
        const readdirCall = readdirSourceOf(context, node.right);
        if (entryVar !== undefined && readdirCall !== undefined) {
          scanBody(state, {
            body: node.body,
            entry: { kind: 'variable', variable: entryVar },
            readdirCall,
          });
        }
      },
      ForStatement(node: TSESTree.ForStatement) {
        checkForStatement(state, node);
      },
      CallExpression(node: TSESTree.CallExpression) {
        checkCallbackCall(state, node);
      },
    };
  },
};
