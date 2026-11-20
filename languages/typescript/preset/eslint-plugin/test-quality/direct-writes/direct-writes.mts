import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, variableNamed, type SourceCode } from '../../rules/typed/node-views.mts';
import { memberKeyOf } from '../../rules/typed/syntax-views.mts';
import {
  COOKIE_KEY,
  DIRECTORY_KEY,
  STORAGE_KEYS,
  assertedEmptyStorage,
  isCypressSpec,
  cookieKey,
  runsInPage,
  savedValueKey,
  stateCall,
} from './state-writes.mts';

type SyntheticMember = {
  readonly type: AST_NODE_TYPES.MemberExpression;
  readonly computed: boolean;
  readonly object: TSESTree.Node;
  readonly property: TSESTree.Node;
};
type Target = TSESTree.Node | SyntheticMember;
type ProcessEnv = SyntheticMember & { readonly object: TSESTree.Identifier };
type WriteNode = TSESTree.AssignmentExpression | TSESTree.UnaryExpression | TSESTree.CallExpression;
export type WriteMessageId =
  | 'unrestoredEnvWrite'
  | 'unrestoredGlobalWrite'
  | 'unrestoredStorageWrite'
  | 'unrestoredCookieWrite'
  | 'unrestoredDirectoryChange';
type Recorded = { readonly node: WriteNode; readonly key: string };

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const OVERRIDDEN_OBJECTS = new Set(['Date', 'Math', 'Intl', 'console', 'navigator']);
const COMPUTED_KEY = '[computed]';
const ENV_KEY = 'process.env';
const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function isProcessEnv(node: Target | undefined): node is ProcessEnv {
  return (
    node?.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'process' &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'env'
  );
}

function isUnshadowed(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (variableNamed(sourceCode, identifier)?.defs.length ?? 0) === 0;
}

function targetKey(sourceCode: SourceCode, target: Target | undefined): string | undefined {
  if (isProcessEnv(target)) {
    return isUnshadowed(sourceCode, target.object) ? ENV_KEY : undefined;
  }
  if (target?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (isProcessEnv(target.object)) {
    return isUnshadowed(sourceCode, target.object.object) ? ENV_KEY : undefined;
  }
  const { object } = target;
  if (object.type !== AST_NODE_TYPES.Identifier || !isUnshadowed(sourceCode, object)) {
    return undefined;
  }
  if (GLOBAL_OBJECTS.has(object.name)) {
    return `globalThis.${memberKeyOf(target, COMPUTED_KEY)}`;
  }
  return OVERRIDDEN_OBJECTS.has(object.name)
    ? `${object.name}.${memberKeyOf(target, COMPUTED_KEY)}`
    : undefined;
}

type WriteTracker = {
  readonly record: (node: WriteNode) => void;
  readonly call: (node: TSESTree.CallExpression) => void;
  readonly unrestored: () => { node: WriteNode; messageId: WriteMessageId }[];
};

const WRITING_CALLS = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Reflect.set',
  'Reflect.deleteProperty',
  'Reflect.defineProperty',
]);

function calleeName(callee: TSESTree.Node): string {
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? `${callee.object.name}.${callee.property.name}`
    : '';
}

function writingCallKey(sourceCode: SourceCode, call: TSESTree.CallExpression): string | undefined {
  const [target, name] = call.arguments;
  if (!WRITING_CALLS.has(calleeName(call.callee)) || target === undefined) {
    return undefined;
  }
  if (isProcessEnv(target)) {
    return isUnshadowed(sourceCode, target.object) ? ENV_KEY : undefined;
  }
  if (name?.type !== AST_NODE_TYPES.Literal || calleeName(call.callee) === 'Object.assign') {
    return undefined;
  }
  return targetKey(sourceCode, {
    type: AST_NODE_TYPES.MemberExpression,
    computed: true,
    object: target,
    property: name,
  });
}

function enclosingFunctionName(node: TSESTree.Node): string | undefined {
  const owner = ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
  if (owner?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return owner.id?.name;
  }
  const holder = owner?.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.id.type === AST_NODE_TYPES.Identifier
    ? holder.id.name
    : undefined;
}

function directWriteKey(sourceCode: SourceCode, node: WriteNode): string | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return targetKey(sourceCode, node.left) ?? cookieKey(sourceCode, node.left);
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete') {
    return targetKey(sourceCode, node.argument);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return writingCallKey(sourceCode, node);
  }
  return undefined;
}

const FILE_SETUP_CALLS = new Set([
  'beforeAll',
  'beforeEach',
  'vi.hoisted',
  'vi.mock',
  'vi.doMock',
  'jest.mock',
  'jest.doMock',
]);

function setupName(call: TSESTree.CallExpression): string {
  return call.callee.type === AST_NODE_TYPES.Identifier
    ? call.callee.name
    : calleeName(call.callee);
}

function isFileSetup(fn: TSESTree.Node): boolean {
  const call = fn.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.parent.type === AST_NODE_TYPES.ExpressionStatement &&
    call.parent.parent.type === AST_NODE_TYPES.Program &&
    FILE_SETUP_CALLS.has(setupName(call))
  );
}

function runsPerTest(node: TSESTree.Node): boolean {
  const functions = ancestorsOf(node).filter((ancestor) => FUNCTIONS.has(ancestor.type));
  const outermost = functions.at(-1);
  return outermost !== undefined && !isFileSetup(outermost);
}

function writeMessageId(key: string): WriteMessageId {
  if (key === ENV_KEY) {
    return 'unrestoredEnvWrite';
  }
  if (STORAGE_KEYS.has(key)) {
    return 'unrestoredStorageWrite';
  }
  if (key === COOKIE_KEY) {
    return 'unrestoredCookieWrite';
  }
  return key === DIRECTORY_KEY ? 'unrestoredDirectoryChange' : 'unrestoredGlobalWrite';
}

const EACH_HOOKS = new Set(['beforeEach', 'afterEach']);

function inEachHook(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.CallExpression &&
      ancestor.callee.type === AST_NODE_TYPES.Identifier &&
      EACH_HOOKS.has(ancestor.callee.name),
  );
}

function innermostFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
}

function restoresLater(write: Recorded, restores: readonly Recorded[]): boolean {
  const owner = innermostFunction(write.node);
  return restores.some(
    (restore) =>
      restore.key === write.key &&
      restore.node.range[0] > write.node.range[0] &&
      innermostFunction(restore.node) === owner,
  );
}

export function createWriteTracker(
  sourceCode: SourceCode,
  isRestored: (node: TSESTree.Node) => boolean,
): WriteTracker {
  const resetPerTest = isCypressSpec(sourceCode);
  const writes: Recorded[] = [];
  const bodyRestores: Recorded[] = [];
  const restoredKeys = new Set<string>();
  const hookCalls = new Set<string>();
  function readKey(target: TSESTree.Node): string | undefined {
    return targetKey(sourceCode, target) ?? cookieKey(sourceCode, target);
  }
  function putsBackSavedValue(node: WriteNode, key: string): boolean {
    return (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      savedValueKey(sourceCode, node.right, readKey) === key
    );
  }
  function isPageState(key: string): boolean {
    return resetPerTest && (STORAGE_KEYS.has(key) || key === COOKIE_KEY);
  }
  function record(node: WriteNode): void {
    const isCall = node.type === AST_NODE_TYPES.CallExpression;
    const emptied = isCall ? assertedEmptyStorage(sourceCode, node) : undefined;
    if (emptied !== undefined) {
      bodyRestores.push({ node, key: emptied });
      return;
    }
    const state = isCall ? stateCall(sourceCode, node) : undefined;
    if (state?.writes === false && inEachHook(node)) {
      restoredKeys.add(state.key);
      return;
    }
    const key = state?.key ?? directWriteKey(sourceCode, node);
    if (
      key === undefined ||
      !runsPerTest(node) ||
      runsInPage(ancestorsOf(node)) ||
      isPageState(key)
    ) {
      return;
    }
    if (isRestored(node)) {
      restoredKeys.add(key);
    } else if (putsBackSavedValue(node, key)) {
      bodyRestores.push({ node, key });
    } else if (state?.writes !== false) {
      writes.push({ node, key });
    }
  }
  return {
    record,
    call(node: TSESTree.CallExpression): void {
      record(node);
      if (node.callee.type === AST_NODE_TYPES.Identifier && isRestored(node)) {
        hookCalls.add(node.callee.name);
      }
    },
    unrestored() {
      const viaHelpers = writes.filter(({ node }) => {
        const name = enclosingFunctionName(node);
        return name !== undefined && hookCalls.has(name);
      });
      const restored = new Set([...restoredKeys, ...viaHelpers.map(({ key }) => key)]);
      return writes
        .filter((write) => !restored.has(write.key) && !restoresLater(write, bodyRestores))
        .map(({ node, key }) => ({ node, messageId: writeMessageId(key) }));
    },
  };
}
