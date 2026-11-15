import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, variableNamed, type SourceCode } from '../../rules/typed/node-views.mts';

type SyntheticMember = {
  readonly type: AST_NODE_TYPES.MemberExpression;
  readonly computed: boolean;
  readonly object: TSESTree.Node;
  readonly property: TSESTree.Node;
};
type Target = TSESTree.Node | SyntheticMember;
type ProcessEnv = SyntheticMember & { readonly object: TSESTree.Identifier };
type WriteNode = TSESTree.AssignmentExpression | TSESTree.UnaryExpression | TSESTree.CallExpression;
type WriteMessageId = 'unrestoredEnvWrite' | 'unrestoredGlobalWrite';

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const OVERRIDDEN_OBJECTS = new Set(['Date', 'Math', 'Intl', 'console']);
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

function memberName(member: SyntheticMember): string {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return member.property.type === AST_NODE_TYPES.Literal
    ? String(member.property.value)
    : '[computed]';
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
    return `globalThis.${memberName(target)}`;
  }
  return OVERRIDDEN_OBJECTS.has(object.name) ? `${object.name}.${memberName(target)}` : undefined;
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
    return targetKey(sourceCode, node.left);
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete') {
    return targetKey(sourceCode, node.argument);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return writingCallKey(sourceCode, node);
  }
  return undefined;
}

const FILE_SETUP_CALLS = new Set(['beforeAll', 'beforeEach', 'vi.hoisted', 'vi.mock', 'vi.doMock']);

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
  return key === ENV_KEY ? 'unrestoredEnvWrite' : 'unrestoredGlobalWrite';
}

export function createWriteTracker(
  sourceCode: SourceCode,
  isRestored: (node: TSESTree.Node) => boolean,
): WriteTracker {
  const writes: { node: WriteNode; key: string }[] = [];
  const restoredKeys = new Set<string>();
  const hookCalls = new Set<string>();
  function record(node: WriteNode): void {
    const key = directWriteKey(sourceCode, node);
    if (key === undefined || !runsPerTest(node)) {
      return;
    }
    if (isRestored(node)) {
      restoredKeys.add(key);
    } else {
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
        .filter(({ key }) => !restored.has(key))
        .map(({ node, key }) => ({ node, messageId: writeMessageId(key) }));
    },
  };
}
