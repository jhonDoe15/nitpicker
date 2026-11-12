import { INHERITED_METHODS, JPA_QUERY, MODIFYING, NATIVE_QUERY } from '../data/data-types.mjs';
import { annotationIn } from '../spring-names.mjs';
import { entriesOf, has, report } from '../spring-scopes.mjs';
import { anyTransactional, helperCalls, inheritsTransactional, placeOf } from './scope.mjs';
import {
  BEANS,
  JPA_REPOSITORY,
  OPERATOR_CALLS,
  TRANSACTIONAL_OPERATOR,
} from './transaction-types.mjs';
import { databaseWrite } from './writes.mjs';

const DERIVED_DELETE = /^(?:delete|remove)(?:\p{Lu}\w*?)?By/u;
const QUERIES = new Set([...JPA_QUERY, ...NATIVE_QUERY]);

function derivedDelete(view, declared, fn) {
  return (
    DERIVED_DELETE.test(fn.name) &&
    !INHERITED_METHODS.has(fn.name) &&
    annotationIn(view.resolve, entriesOf(fn), QUERIES) === undefined &&
    view.extendsType(declared.qualified, JPA_REPOSITORY)
  );
}

function repositoryWritesWithoutTransaction(view) {
  return view.file.classes
    .filter((declared) => declared.kind === 'interface' && view.isRepository(declared.qualified))
    .filter((declared) => !anyTransactional(view, declared.annotations))
    .filter((declared) => !inheritsTransactional(view, declared))
    .flatMap((declared) =>
      view
        .functionsOf(declared.qualified)
        .filter((fn) => !fn.hasBody && !anyTransactional(view, entriesOf(fn)))
        .filter((fn) => has(view, fn, MODIFYING) || derivedDelete(view, declared, fn))
        .map((fn) => report('SpringDataWriteWithoutTransaction', fn, `${fn.owner}.${fn.name}`)),
    );
}

function usesOperator(view, fn) {
  return view.file.invocations.some(
    (invocation) =>
      OPERATOR_CALLS.has(invocation.name) &&
      placeOf(view, invocation.scope).fn === fn &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), TRANSACTIONAL_OPERATOR),
  );
}

function directWrites(view, fn) {
  return view.file.invocations.filter(
    (invocation) => placeOf(view, invocation.scope).fn === fn && databaseWrite(view, invocation),
  );
}

function armsOf(site) {
  return (site.arms ?? []).map((entry) => {
    const [at, arm, end] = entry.split(':');
    return { at, arm, end: end === undefined ? undefined : Number(end) };
  });
}

function leaves(left, right) {
  const shared = new Set(armsOf(right).map(({ at }) => at));
  return armsOf(left).some(
    ({ at, end }) => end !== undefined && !shared.has(at) && right.line > end,
  );
}

function exclusive(left, right) {
  const arms = new Map(armsOf(left).map(({ at, arm }) => [at, arm]));
  return (
    armsOf(right).some(({ at, arm }) => arms.has(at) && arms.get(at) !== arm) ||
    leaves(left, right) ||
    leaves(right, left)
  );
}

function writesTwice(sites) {
  return sites.some((left, index) =>
    sites.slice(index + 1).some((right) => !exclusive(left, right)),
  );
}

function writesMoreThanOnce(view, fn) {
  const calls = helperCalls(view, fn).filter(({ helper }) => directWrites(view, helper).length > 0);
  return (
    writesTwice([...directWrites(view, fn), ...calls.map(({ call }) => call)]) ||
    calls.some(({ helper }) => writesTwice(directWrites(view, helper)))
  );
}

function multiWrites(view) {
  return view.file.classes
    .filter((declared) => declared.kind === 'class')
    .filter((declared) => annotationIn(view.resolve, declared.annotations, BEANS) !== undefined)
    .filter((declared) => !anyTransactional(view, declared.annotations))
    .filter((declared) => !inheritsTransactional(view, declared))
    .flatMap((declared) =>
      view
        .functionsOf(declared.qualified)
        .filter((fn) => fn.visibility === 'public' && fn.hasBody !== false)
        .filter((fn) => !anyTransactional(view, entriesOf(fn)) && !usesOperator(view, fn))
        .filter((fn) => writesMoreThanOnce(view, fn))
        .map((fn) =>
          report('SpringMultiWriteWithoutTransaction', fn, `${declared.qualified}.${fn.name}`),
        ),
    );
}

export const UNGUARDED_WRITE_RULES = [repositoryWritesWithoutTransaction, multiWrites];
