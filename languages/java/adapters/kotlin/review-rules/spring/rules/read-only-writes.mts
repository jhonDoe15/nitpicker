import { argumentOf, isTrue } from '../spring-names.mts';
import { symbolOf } from '../spring-scopes.mts';
import { ENTITY_MANAGER } from '../spring-types.mts';
import { transactionOf } from '../transactions/scope.mts';
import { databaseWrite } from '../transactions/writes.mts';
import type {
  Annotation,
  FunctionFact,
  InvocationFact,
  LocalFact,
  Reported,
  SpringView,
} from '../typed/spring-shapes.mts';

const LOAD = /^(?:find|get|read|query|search|load|fetch)(?:[A-Z\d_]|$)/u;
const ENTITY_MANAGER_LOADS = new Set(['find', 'getReference', 'merge']);
const UNWRAPPING = new Set(['orElseThrow', 'orElse', 'orElseGet', 'get']);
const SETTER = /^set\p{Lu}/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;

function readOnly(annotation: Annotation | undefined): boolean {
  return annotation !== undefined && isTrue(argumentOf(annotation, 'readOnly'));
}

function underReadOnly(view: SpringView, fn: FunctionFact): boolean {
  const { own, jakarta, inherited } = transactionOf(view, fn);
  return readOnly(own) || (own === undefined && jakarta === undefined && readOnly(inherited));
}

function loads(view: SpringView, invocation: InvocationFact): boolean {
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

function notEntity(view: SpringView, scope: number, name: string): boolean {
  const type = view.typeOf(scope, name);
  const found = type === undefined ? undefined : view.projectClass(type.replace(/[<?].*$/su, ''));
  return (
    found !== undefined &&
    !found.declared.annotations.some(
      (entry) => (entry.type ?? entry.name).split('.').at(-1) === 'Entity',
    )
  );
}

function initializes(entry: InvocationFact, local: LocalFact): boolean {
  return entry.assignedTo === undefined
    ? entry.elvis !== undefined && entry.line === local.line && local.alias === undefined
    : entry.assignedTo === local.name && entry.line >= local.line;
}

function nearestLocal(
  view: SpringView,
  scopeId: number,
  name: string | undefined,
): LocalFact | undefined {
  for (const scope of view.chain(scopeId)) {
    const local = (view.file.locals ?? []).findLast(
      (entry) => entry.scope === scope.id && entry.name === name,
    );
    if (local !== undefined || (scope.params ?? []).some((entry) => entry.name === name)) {
      return local;
    }
  }
  return undefined;
}

function loadedLocal(view: SpringView, invocation: InvocationFact): boolean {
  const fn = view.functionAt(invocation.scope);
  const local = nearestLocal(view, invocation.scope, invocation.receiver);
  if (local !== undefined && view.functionAt(local.scope) !== fn) {
    return false;
  }
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

function entityChange(view: SpringView, invocation: InvocationFact): boolean {
  return (
    IDENTIFIER.test(invocation.receiver ?? '') &&
    (invocation.assign === true || SETTER.test(invocation.name)) &&
    loadedLocal(view, invocation)
  );
}

export function readOnlyWrites(view: SpringView): Reported[] {
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
