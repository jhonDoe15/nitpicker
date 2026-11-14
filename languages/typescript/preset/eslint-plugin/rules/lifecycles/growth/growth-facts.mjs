import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { functionName, isFunctionNode } from '../scope/close-scopes.mjs';
import { useKind } from '../scope/collections.mjs';

const REGISTRATION_NAME = /^(?:init|register)|^on\w*Init/u;
const BOUNDING_READS = new Set(['size', 'length']);

function adderOf(use) {
  return ancestorsOf(use).find(isFunctionNode);
}

function isConstructor(fn) {
  return fn?.parent.type === 'MethodDefinition' && fn.parent.kind === 'constructor';
}

function isLiteralKey(add) {
  const key = add.method === 'index' ? add.key : addedKey(add);
  return key?.type === 'Literal';
}

function addedKey(add) {
  return add.method === 'set' || add.method === 'add' ? add.call.arguments[0] : undefined;
}

function persists(fn, container) {
  if (container.type === 'ClassBody') {
    return fn !== undefined && !isConstructor(fn);
  }
  return fn !== undefined && fn !== container && fn.parent.type !== 'CallExpression';
}

function returnsClosure(container) {
  if (container.type === 'ClassBody') {
    return true;
  }
  return (
    container.body.type !== 'BlockStatement' ||
    container.body.body.some((statement) => statement.type === 'ReturnStatement')
  );
}

export function growingAdds(uses, container) {
  if (!returnsClosure(container)) {
    return [];
  }
  return uses
    .map((use) => ({ use, ...useKind(use) }))
    .filter(({ kind }) => kind === 'add')
    .filter(({ use }) => persists(adderOf(use), container))
    .filter((add) => !isLiteralKey(add))
    .filter(({ use }) => !REGISTRATION_NAME.test(functionName(adderOf(use)) ?? ''));
}

function removesIn(use) {
  const { kind } = useKind(use);
  return (
    kind === 'remove' || kind === 'escape' || (kind === 'reassign' && !isConstructor(adderOf(use)))
  );
}

function boundsSize(use) {
  const { kind, method } = useKind(use);
  return kind === 'read' && BOUNDING_READS.has(method);
}

export function isRemoved(uses) {
  return uses.some((use) => removesIn(use) || boundsSize(use));
}

export function adderName(add) {
  const name = functionName(adderOf(add.use));
  return name === undefined ? 'a callback' : `${name}()`;
}

export function isDeclaration(use) {
  return use.parent.type === 'VariableDeclarator' && use.parent.id === use;
}

const SERVICE_NAME = /(?:Service|Manager|Registry|Store|Cache|Client|Server|Gateway|Repository)$/u;

export function isLongLived(container, closers) {
  if (container.type !== 'ClassBody') {
    return closers.length > 0;
  }
  const declaration = container.parent;
  return (
    closers.length > 0 ||
    (declaration.decorators ?? []).length > 0 ||
    SERVICE_NAME.test(declaration.id?.name ?? '')
  );
}
