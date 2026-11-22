import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type SourceCode } from '../../rules/typed/node-views.mts';
import {
  COOKIE_KEY,
  STORAGE_KEYS,
  assertedEmptyStorage,
  isCypressSpec,
  cookieKey,
  runsInPage,
  savedValueKey,
  stateCall,
} from './state-writes.mts';
import {
  CLEARING_HOOKS,
  enclosingFunctionName,
  inEachHook,
  innermostFunction,
  isNamedPageFunction,
  isPutBackByLaterWrite,
  isStubbedAway,
  restoresLater,
  stubbedName,
} from './restore-signals.mts';
import {
  directWriteKey,
  runsPerTest,
  targetKey,
  writeMessageId,
  type WriteMessageId,
  type WriteNode,
} from './write-keys.mts';

type WriteTracker = {
  readonly record: (node: WriteNode) => void;
  readonly call: (node: TSESTree.CallExpression) => void;
  readonly unrestored: () => { node: WriteNode; messageId: WriteMessageId }[];
};

type Recorded = { readonly node: WriteNode; readonly key: string };

type TrackerState = {
  readonly sourceCode: SourceCode;
  readonly isRestored: (node: TSESTree.Node) => boolean;
  readonly resetPerTest: boolean;
  readonly writes: Recorded[];
  readonly bodyRestores: Recorded[];
  readonly restoredKeys: Set<string>;
  readonly hookCalls: Set<string>;
  readonly clearingCalls: Set<string>;
  readonly stubbed: Set<string>;
  readonly clears: Recorded[];
};

function readKey(sourceCode: SourceCode, target: TSESTree.Node): string | undefined {
  return targetKey(sourceCode, target) ?? cookieKey(sourceCode, target);
}

function putsBackSavedValue(state: TrackerState, node: WriteNode, key: string): boolean {
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    savedValueKey(state.sourceCode, node.right, (target) => readKey(state.sourceCode, target)) ===
      key
  );
}

function skipsWrite(state: TrackerState, node: WriteNode, key: string): boolean {
  const ancestors = ancestorsOf(node);
  return (
    !runsPerTest(node) ||
    runsInPage(ancestors) ||
    isNamedPageFunction(state.sourceCode, ancestors) ||
    (state.resetPerTest && (STORAGE_KEYS.has(key) || key === COOKIE_KEY))
  );
}

function putsBackLater(state: TrackerState, node: WriteNode, key: string): boolean {
  return (
    isPutBackByLaterWrite(key) &&
    state.writes.some(
      (write) => write.key === key && innermostFunction(write.node) === innermostFunction(node),
    )
  );
}

function sortWrite(
  state: TrackerState,
  node: WriteNode,
  { key, clears }: { readonly key: string; readonly clears: boolean },
): void {
  if (state.isRestored(node)) {
    state.restoredKeys.add(key);
  } else if (putsBackSavedValue(state, node, key) || clears) {
    state.bodyRestores.push({ node, key });
  } else {
    (putsBackLater(state, node, key) ? state.bodyRestores : state.writes).push({ node, key });
  }
}

function recordWrite(state: TrackerState, node: WriteNode): void {
  const call = node.type === AST_NODE_TYPES.CallExpression ? node : undefined;
  const emptied = call === undefined ? undefined : assertedEmptyStorage(state.sourceCode, call);
  if (emptied !== undefined) {
    state.bodyRestores.push({ node, key: emptied });
    return;
  }
  const stored = call === undefined ? undefined : stateCall(state.sourceCode, call);
  const clears = stored?.writes === false;
  if (clears && inEachHook(node)) {
    state.restoredKeys.add(stored.key);
    return;
  }
  if (clears) {
    state.clears.push({ node, key: stored.key });
  }
  const key = stored?.key ?? directWriteKey(state.sourceCode, node);
  if (key !== undefined && !skipsWrite(state, node, key)) {
    sortWrite(state, node, { key, clears });
  }
}

function recordCall(state: TrackerState, node: TSESTree.CallExpression): void {
  recordWrite(state, node);
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier && state.isRestored(node)) {
    state.hookCalls.add(callee.name);
  }
  const hook = callee.type === AST_NODE_TYPES.Identifier && CLEARING_HOOKS.has(callee.name);
  const clearing = hook || inEachHook(node) || state.isRestored(node);
  for (const each of clearing ? [callee, ...node.arguments] : []) {
    if (each.type === AST_NODE_TYPES.Identifier) {
      state.clearingCalls.add(each.name);
    }
  }
  const stub = stubbedName(node);
  if (stub !== undefined) {
    state.stubbed.add(stub);
  }
}

function unrestoredWrites(state: TrackerState): { node: WriteNode; messageId: WriteMessageId }[] {
  const viaHelpers = state.writes.filter(({ node }) => {
    const name = enclosingFunctionName(node);
    return name !== undefined && state.hookCalls.has(name);
  });
  const clearedInHooks = state.clears.filter(({ node }) =>
    state.clearingCalls.has(enclosingFunctionName(node) ?? ''),
  );
  const restored = new Set(
    [...state.restoredKeys, ...viaHelpers, ...clearedInHooks].map((each) =>
      typeof each === 'string' ? each : each.key,
    ),
  );
  return state.writes
    .filter(
      (write) =>
        !(
          restored.has(write.key) ||
          isStubbedAway(write.key, state.stubbed) ||
          restoresLater(write, state.bodyRestores)
        ),
    )
    .map(({ node, key }) => ({ node, messageId: writeMessageId(key) }));
}

export function createWriteTracker(
  sourceCode: SourceCode,
  isRestored: (node: TSESTree.Node) => boolean,
): WriteTracker {
  const state: TrackerState = {
    sourceCode,
    isRestored,
    resetPerTest: isCypressSpec(sourceCode),
    writes: [],
    bodyRestores: [],
    restoredKeys: new Set(),
    hookCalls: new Set(),
    clearingCalls: new Set(),
    stubbed: new Set(),
    clears: [],
  };
  return {
    record: (node) => {
      recordWrite(state, node);
    },
    call: (node) => {
      recordCall(state, node);
    },
    unrestored: () => unrestoredWrites(state),
  };
}
