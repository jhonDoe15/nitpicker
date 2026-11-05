import { importedCalleeName, isPromisify } from '../analysis/subprocess-calls.mjs';

const SYNC_MEMBERS = new Map([
  ['spawn', 'spawnSync'],
  ['execa', 'execaSync'],
  ['$', '$sync'],
]);
const SYNC_MEMBER_NAMES = new Set(['sync', 's']);
const TEMPLATE_TAGS = new Set(['execa', 'execaSync', '$', '$sync']);

const DISPLAY_NAMES = new Map([['$sync', '$.sync']]);

export function displayName(method) {
  return DISPLAY_NAMES.get(method) ?? method;
}

function syncMemberMethod(callee, bindings) {
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    !SYNC_MEMBER_NAMES.has(callee.property.name)
  ) {
    return undefined;
  }
  return SYNC_MEMBERS.get(importedCalleeName(callee.object, bindings));
}

export function calleeMethod(callee, bindings) {
  if (callee.type === 'CallExpression' && isPromisify(callee.callee)) {
    const [wrapped] = callee.arguments;
    return wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
  }
  return syncMemberMethod(callee, bindings) ?? importedCalleeName(callee, bindings);
}

export function promisifiedBinding(declarator, bindings) {
  const { id, init } = declarator;
  if (id.type !== 'Identifier' || init?.type !== 'CallExpression' || !isPromisify(init.callee)) {
    return bindings;
  }
  const [wrapped] = init.arguments;
  const name = wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
  return name === undefined
    ? bindings
    : { ...bindings, named: new Map(bindings.named).set(id.name, name) };
}

export function templateTag(tag, bindings) {
  const callee = tag.type === 'CallExpression' ? tag.callee : tag;
  const method = calleeMethod(callee, bindings);
  if (!TEMPLATE_TAGS.has(method)) {
    return undefined;
  }
  return { method, call: tag.type === 'CallExpression' ? tag : undefined };
}
