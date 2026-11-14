import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { childrenOf, closersOf } from '../scope/close-owners.mjs';
import { isFunctionNode } from '../scope/close-scopes.mjs';

const REMOVE_METHODS = new Set([
  'off',
  'removeListener',
  'removeEventListener',
  'removeAllListeners',
]);
const OWNER_RELEASES = new Set([
  'close',
  'destroy',
  'end',
  'terminate',
  'dispose',
  'disconnect',
  'stop',
]);
const CLEARERS = new Set(['clearTimeout', 'clearInterval']);

export function isOneShot(call) {
  const options = call.arguments[2];
  return (
    options?.type === 'ObjectExpression' &&
    options.properties.some(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        (property.key.name === 'signal' ||
          (property.key.name === 'once' && property.value.value === true)),
    )
  );
}

export function containerWithClosers(node) {
  const container = ancestorsOf(node).find(
    (ancestor) =>
      (ancestor.type === 'ClassBody' || isFunctionNode(ancestor)) && closersOf(ancestor).length > 0,
  );
  return container === undefined ? undefined : { container, closers: closersOf(container) };
}

export function runsOnce(call, owner) {
  const fn = ancestorsOf(call).find(isFunctionNode);
  const isConstructor = fn?.parent.type === 'MethodDefinition' && fn.parent.kind === 'constructor';
  return fn === owner.container || isConstructor;
}

function callsIn(container) {
  return [...depthFirst(container, childrenOf)].filter((node) => node.type === 'CallExpression');
}

export function normalized(sourceCode, node) {
  return sourceCode
    .getText(node)
    .replace(/!(?!=)/gu, '')
    .replace(/\s+as\s+\w+/gu, '')
    .replace(/^(?:window|globalThis)\./u, '');
}

function aliasesOf(sourceCode, container, text) {
  const declared = [...depthFirst(container, childrenOf)];
  return new Set([
    text,
    ...declared
      .filter(
        (node) =>
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init !== null &&
          normalized(sourceCode, node.init) === text,
      )
      .map((node) => node.id.name),
  ]);
}

export function releasesListener(sourceCode, container, receiverText) {
  const names = aliasesOf(sourceCode, container, receiverText);
  return callsIn(container).some((call) => {
    const { callee } = call;
    return (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      names.has(normalized(sourceCode, callee.object)) &&
      (REMOVE_METHODS.has(callee.property.name) || OWNER_RELEASES.has(callee.property.name))
    );
  });
}

export function clearsHandle(sourceCode, container, handleText) {
  const names = aliasesOf(sourceCode, container, handleText);
  return callsIn(container).some((call) => {
    const callee = call.callee.type === 'MemberExpression' ? call.callee.property : call.callee;
    return (
      callee.type === 'Identifier' &&
      CLEARERS.has(callee.name) &&
      call.arguments.length > 0 &&
      names.has(normalized(sourceCode, call.arguments[0]))
    );
  });
}

export function timerHandle(call) {
  const { parent } = call;
  if (parent.type === 'AssignmentExpression' && parent.right === call) {
    return parent.left;
  }
  return parent.type === 'VariableDeclarator' && parent.init === call ? parent.id : undefined;
}

export function insidePromiseExecutor(call) {
  return ancestorsOf(call).some(
    (ancestor) =>
      isFunctionNode(ancestor) &&
      ancestor.parent.type === 'NewExpression' &&
      ancestor.parent.callee.name === 'Promise',
  );
}
