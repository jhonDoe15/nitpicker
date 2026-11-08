import { argumentOf, isTrue } from '../spring-names.mjs';
import { symbolOf } from '../spring-scopes.mjs';
import { ENTITY_MANAGER } from '../spring-types.mjs';
import { transactionOf } from '../transactions/scope.mjs';
import { databaseWrite } from '../transactions/writes.mjs';

const LOAD = /^(?:find|get|read|query|search|load|fetch)(?:[A-Z\d_]|$)/u;
const ENTITY_MANAGER_LOADS = new Set(['find', 'getReference', 'merge']);
const UNWRAPPING = new Set(['orElseThrow', 'orElse', 'orElseGet', 'get']);
const SETTER = /^set\p{Lu}/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;

function readOnly(annotation) {
  return annotation !== undefined && isTrue(argumentOf(annotation, 'readOnly'));
}

function underReadOnly(view, fn) {
  const { own, jakarta, inherited } = transactionOf(view, fn);
  return readOnly(own) || (own === undefined && jakarta === undefined && readOnly(inherited));
}

function loads(view, invocation) {
  if (invocation.receiver === undefined) {
    return false;
  }
  const type = view.typeOf(invocation.scope, invocation.receiver);
  const unwrapped = (invocation.after ?? []).every((name) => UNWRAPPING.has(name));
  return (
    type !== undefined &&
    unwrapped &&
    ((LOAD.test(invocation.name) && view.isRepository(type)) ||
      (ENTITY_MANAGER_LOADS.has(invocation.name) && view.is(type, ENTITY_MANAGER)))
  );
}

function notEntity(view, scope, name) {
  const type = view.typeOf(scope, name);
  const found = type === undefined ? undefined : view.projectClass(type.replace(/[<?].*$/su, ''));
  return (
    found !== undefined &&
    !(found.declared.annotations ?? []).some(
      (entry) => (entry.type ?? entry.name).split('.').at(-1) === 'Entity',
    )
  );
}

function initializes(entry, local) {
  return entry.assignedTo === undefined
    ? entry.elvis !== undefined && entry.line === local.line
    : entry.assignedTo === local.name && entry.line >= local.line;
}

function loadedLocal(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  const local = (view.file.locals ?? []).find(
    (entry) =>
      entry.name === invocation.receiver &&
      view.chain(invocation.scope).some(({ id }) => id === entry.scope) &&
      view.functionAt(entry.scope) === fn,
  );
  if (local === undefined || notEntity(view, invocation.scope, local.name)) {
    return false;
  }
  const reassigned = view.file.invocations.some(
    (entry) =>
      entry.assign === true &&
      entry.receiver === undefined &&
      entry.name === local.name &&
      view.functionAt(entry.scope) === fn,
  );
  return (
    !reassigned &&
    view.file.invocations.some(
      (entry) => entry.scope === local.scope && initializes(entry, local) && loads(view, entry),
    )
  );
}

function entityChange(view, invocation) {
  return (
    IDENTIFIER.test(invocation.receiver ?? '') &&
    (invocation.assign === true || SETTER.test(invocation.name)) &&
    loadedLocal(view, invocation)
  );
}

export function readOnlyWrites(view) {
  return view.file.invocations.flatMap((invocation) => {
    const fn = view.functionAt(invocation.scope);
    const write = databaseWrite(view, invocation) || entityChange(view, invocation);
    return fn !== undefined && write && underReadOnly(view, fn)
      ? [
          {
            rule: 'SpringTransactionalReadOnlyWrite',
            line: invocation.line,
            symbol: symbolOf(view, invocation.scope, invocation.name),
          },
        ]
      : [];
  });
}
