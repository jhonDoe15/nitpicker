import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type SourceCode } from '../../rules/typed/node-views.mts';
import { memberKeyOf } from '../../rules/typed/syntax-views.mts';
import {
  COOKIE_KEY,
  DIRECTORY_KEY,
  STORAGE_KEYS,
  cookieKey,
  isUnshadowed,
} from './state-writes.mts';

type SyntheticMember = {
  readonly type: AST_NODE_TYPES.MemberExpression;
  readonly computed: boolean;
  readonly object: TSESTree.Node;
  readonly property: TSESTree.Node;
};
type Target = TSESTree.Node | SyntheticMember;
type ProcessEnv = SyntheticMember & { readonly object: TSESTree.Identifier };
export type WriteNode =
  TSESTree.AssignmentExpression | TSESTree.UnaryExpression | TSESTree.CallExpression;
export type WriteMessageId =
  | 'unrestoredEnvWrite'
  | 'unrestoredGlobalWrite'
  | 'unrestoredStorageWrite'
  | 'unrestoredCookieWrite'
  | 'unrestoredDirectoryChange';

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

export function targetKey(sourceCode: SourceCode, target: Target | undefined): string | undefined {
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

export function directWriteKey(sourceCode: SourceCode, node: WriteNode): string | undefined {
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

export function runsPerTest(node: TSESTree.Node): boolean {
  const functions = ancestorsOf(node).filter((ancestor) => FUNCTIONS.has(ancestor.type));
  const outermost = functions.at(-1);
  return outermost !== undefined && !isFileSetup(outermost);
}

export function writeMessageId(key: string): WriteMessageId {
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
