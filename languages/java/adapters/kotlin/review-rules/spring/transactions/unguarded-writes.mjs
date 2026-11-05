import { INHERITED_METHODS, JPA_QUERY, MODIFYING, NATIVE_QUERY } from '../data/data-types.mjs';
import { annotationIn } from '../spring-names.mjs';
import { entriesOf, has, report } from '../spring-scopes.mjs';
import { anyTransactional, helpersOf, placeOf } from './scope.mjs';
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

function writeSites(view, fn) {
  const owners = new Set([fn, ...helpersOf(view, fn)]);
  return view.file.invocations.filter(
    (invocation) =>
      owners.has(placeOf(view, invocation.scope).fn) && databaseWrite(view, invocation),
  );
}

function exclusive(left, right) {
  const arms = new Map((left.arms ?? []).map((entry) => entry.split(':')));
  return (right.arms ?? [])
    .map((entry) => entry.split(':'))
    .some(([at, arm]) => arms.has(at) && arms.get(at) !== arm);
}

function writesTwice(sites) {
  return sites.some((left, index) =>
    sites.slice(index + 1).some((right) => !exclusive(left, right)),
  );
}

function multiWrites(view) {
  return view.file.classes
    .filter((declared) => declared.kind === 'class')
    .filter((declared) => annotationIn(view.resolve, declared.annotations, BEANS) !== undefined)
    .filter((declared) => !anyTransactional(view, declared.annotations))
    .flatMap((declared) =>
      view
        .functionsOf(declared.qualified)
        .filter((fn) => fn.visibility === 'public' && fn.hasBody !== false)
        .filter((fn) => !anyTransactional(view, entriesOf(fn)) && !usesOperator(view, fn))
        .filter((fn) => writesTwice(writeSites(view, fn)))
        .map((fn) =>
          report('SpringMultiWriteWithoutTransaction', fn, `${declared.qualified}.${fn.name}`),
        ),
    );
}

export const UNGUARDED_WRITE_RULES = [repositoryWritesWithoutTransaction, multiWrites];
