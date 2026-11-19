import { INHERITED_METHODS, JPA_QUERY, MODIFYING, NATIVE_QUERY } from '../data/data-types.mts';
import { annotationIn } from '../spring-names.mts';
import { entriesOf, has, report } from '../spring-scopes.mts';
import { anyTransactional, helperCalls, inheritsTransactional, placeOf } from './scope.mts';
import {
  BEANS,
  JPA_REPOSITORY,
  OPERATOR_CALLS,
  TRANSACTIONAL_OPERATOR,
} from './transaction-types.mts';
import { databaseWrite } from './writes.mts';
import type {
  ClassFact,
  FunctionFact,
  InvocationFact,
  Reported,
  SpringView,
} from '../typed/spring-shapes.mts';

type Arm = { at: string | undefined; arm: string | undefined; end: number | undefined };

const DERIVED_DELETE = /^(?:delete|remove)(?:\p{Lu}\w*?)?By/u;
const QUERIES = new Set([...JPA_QUERY, ...NATIVE_QUERY]);

function derivedDelete(view: SpringView, declared: ClassFact, fn: FunctionFact): boolean {
  return (
    DERIVED_DELETE.test(fn.name) &&
    !INHERITED_METHODS.has(fn.name) &&
    annotationIn(view.resolve, entriesOf(fn), QUERIES) === undefined &&
    view.extendsType(declared.qualified, JPA_REPOSITORY)
  );
}

function untransactionedClasses(
  view: SpringView,
  keep: (declared: ClassFact) => boolean,
): ClassFact[] {
  return view.file.classes
    .filter((declared) => keep(declared))
    .filter((declared) => !anyTransactional(view, declared.annotations))
    .filter((declared) => !inheritsTransactional(view, declared));
}

function repositoryWritesWithoutTransaction(view: SpringView): Reported[] {
  return untransactionedClasses(
    view,
    (declared) => declared.kind === 'interface' && view.isRepository(declared.qualified),
  ).flatMap((declared) =>
    view
      .functionsOf(declared.qualified)
      .filter((fn) => !(fn.hasBody || anyTransactional(view, entriesOf(fn))))
      .filter((fn) => has(view, fn, MODIFYING) || derivedDelete(view, declared, fn))
      .map((fn) => report('SpringDataWriteWithoutTransaction', fn, `${fn.owner}.${fn.name}`)),
  );
}

function usesOperator(view: SpringView, fn: FunctionFact): boolean {
  return view.file.invocations.some(
    (invocation) =>
      OPERATOR_CALLS.has(invocation.name) &&
      placeOf(view, invocation.scope).fn === fn &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), TRANSACTIONAL_OPERATOR),
  );
}

function directWrites(view: SpringView, fn: FunctionFact): InvocationFact[] {
  return view.file.invocations.filter(
    (invocation) => placeOf(view, invocation.scope).fn === fn && databaseWrite(view, invocation),
  );
}

function armsOf(site: InvocationFact): Arm[] {
  return (site.arms ?? []).map((entry) => {
    const [at, arm, end] = entry.split(':');
    return { at, arm, end: end === undefined ? undefined : Number(end) };
  });
}

function leaves(left: InvocationFact, right: InvocationFact): boolean {
  const shared = new Set(armsOf(right).map(({ at }) => at));
  return armsOf(left).some(
    ({ at, end }) => end !== undefined && !shared.has(at) && right.line > end,
  );
}

function exclusive(left: InvocationFact, right: InvocationFact): boolean {
  const arms = new Map(
    armsOf(left).map(({ at, arm }): [string | undefined, string | undefined] => [at, arm]),
  );
  return (
    armsOf(right).some(({ at, arm }) => arms.has(at) && arms.get(at) !== arm) ||
    leaves(left, right) ||
    leaves(right, left)
  );
}

function writesTwice(sites: InvocationFact[]): boolean {
  return sites.some((left, index) =>
    sites.slice(index + 1).some((right) => !exclusive(left, right)),
  );
}

function writesMoreThanOnce(view: SpringView, fn: FunctionFact): boolean {
  const calls = helperCalls(view, fn).filter(({ helper }) => directWrites(view, helper).length > 0);
  return (
    writesTwice([...directWrites(view, fn), ...calls.map(({ call }) => call)]) ||
    calls.some(({ helper }) => writesTwice(directWrites(view, helper)))
  );
}

function multiWrites(view: SpringView): Reported[] {
  return untransactionedClasses(
    view,
    (declared) =>
      declared.kind === 'class' &&
      annotationIn(view.resolve, declared.annotations, BEANS) !== undefined,
  ).flatMap((declared) =>
    view
      .functionsOf(declared.qualified)
      .filter((fn) => fn.visibility === 'public' && fn.hasBody)
      .filter((fn) => !(anyTransactional(view, entriesOf(fn)) || usesOperator(view, fn)))
      .filter((fn) => writesMoreThanOnce(view, fn))
      .map((fn) =>
        report('SpringMultiWriteWithoutTransaction', fn, `${declared.qualified}.${fn.name}`),
      ),
  );
}

export const UNGUARDED_WRITE_RULES = [repositoryWritesWithoutTransaction, multiWrites];
