import { ancestorsOf, variableNamed } from '../../rules/analysis/ancestry.mjs';

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const OVERRIDDEN_OBJECTS = new Set(['Date', 'Math', 'Intl', 'console']);
const ENV_KEY = 'process.env';
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function isProcessEnv(node) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

function isUnshadowed(sourceCode, identifier) {
  return (variableNamed(sourceCode, identifier)?.defs.length ?? 0) === 0;
}

function memberName(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.property.type === 'Literal' ? String(member.property.value) : '[computed]';
}

function targetKey(sourceCode, target) {
  if (isProcessEnv(target)) {
    return isUnshadowed(sourceCode, target.object) ? ENV_KEY : undefined;
  }
  if (target?.type !== 'MemberExpression') {
    return undefined;
  }
  if (isProcessEnv(target.object)) {
    return isUnshadowed(sourceCode, target.object.object) ? ENV_KEY : undefined;
  }
  const { object } = target;
  if (object.type !== 'Identifier' || !isUnshadowed(sourceCode, object)) {
    return undefined;
  }
  if (GLOBAL_OBJECTS.has(object.name)) {
    return `globalThis.${memberName(target)}`;
  }
  return OVERRIDDEN_OBJECTS.has(object.name) ? `${object.name}.${memberName(target)}` : undefined;
}

const WRITING_CALLS = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Reflect.set',
  'Reflect.deleteProperty',
  'Reflect.defineProperty',
]);

function calleeName(callee) {
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier'
    ? `${callee.object.name}.${callee.property.name}`
    : '';
}

function writingCallKey(sourceCode, call) {
  const [target, name] = call.arguments;
  if (!WRITING_CALLS.has(calleeName(call.callee)) || target === undefined) {
    return undefined;
  }
  if (isProcessEnv(target)) {
    return isUnshadowed(sourceCode, target.object) ? ENV_KEY : undefined;
  }
  if (name?.type !== 'Literal' || calleeName(call.callee) === 'Object.assign') {
    return undefined;
  }
  return targetKey(sourceCode, {
    type: 'MemberExpression',
    computed: true,
    object: target,
    property: name,
  });
}

function enclosingFunctionName(node) {
  const owner = ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
  if (owner?.type === 'FunctionDeclaration') {
    return owner.id?.name;
  }
  const holder = owner?.parent;
  return holder?.type === 'VariableDeclarator' && holder.id.type === 'Identifier'
    ? holder.id.name
    : undefined;
}

function directWriteKey(sourceCode, node) {
  if (node.type === 'AssignmentExpression') {
    return targetKey(sourceCode, node.left);
  }
  if (node.type === 'UnaryExpression' && node.operator === 'delete') {
    return targetKey(sourceCode, node.argument);
  }
  if (node.type === 'CallExpression') {
    return writingCallKey(sourceCode, node);
  }
  return undefined;
}

const FILE_SETUP_CALLS = new Set(['beforeAll', 'beforeEach', 'vi.hoisted', 'vi.mock', 'vi.doMock']);

function setupName(call) {
  return call.callee.type === 'Identifier' ? call.callee.name : calleeName(call.callee);
}

function isFileSetup(fn) {
  const call = fn.parent;
  return (
    call?.type === 'CallExpression' &&
    call.parent?.type === 'ExpressionStatement' &&
    call.parent.parent?.type === 'Program' &&
    FILE_SETUP_CALLS.has(setupName(call))
  );
}

function runsPerTest(node) {
  const functions = ancestorsOf(node).filter((ancestor) => FUNCTIONS.has(ancestor.type));
  return functions.length > 0 && !isFileSetup(functions.at(-1));
}

function writeMessageId(key) {
  return key === ENV_KEY ? 'unrestoredEnvWrite' : 'unrestoredGlobalWrite';
}

export function createWriteTracker(sourceCode, isRestored) {
  const writes = [];
  const restoredKeys = new Set();
  const hookCalls = new Set();
  function record(node) {
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
    call(node) {
      record(node);
      if (node.callee.type === 'Identifier' && isRestored(node)) {
        hookCalls.add(node.callee.name);
      }
    },
    unrestored() {
      const viaHelpers = writes.filter(({ node }) => hookCalls.has(enclosingFunctionName(node)));
      const restored = new Set([...restoredKeys, ...viaHelpers.map(({ key }) => key)]);
      return writes
        .filter(({ key }) => !restored.has(key))
        .map(({ node, key }) => ({ node, messageId: writeMessageId(key) }));
    },
  };
}
