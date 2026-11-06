import { annotationIn, argumentOf, isTrue, typeName } from '../spring-names.mjs';
import { acceptsArguments, entriesOf, isSelfCall, ownerOf } from '../spring-scopes.mjs';
import { JAKARTA_TRANSACTIONAL, SPRING_TRANSACTIONAL } from '../spring-types.mjs';
import { TEMPLATE_CALLS, TRANSACTION_TEMPLATES } from './transaction-types.mjs';

const NO_TRANSACTION = /\b(?:NOT_SUPPORTED|NEVER|SUPPORTS)\b/u;
const AFTER_COMMIT = /commit|completion/iu;

export function transactionOf(view, fn) {
  const owner = view.classes.get(fn.owner);
  return {
    own: annotationIn(view.resolve, entriesOf(fn), SPRING_TRANSACTIONAL),
    jakarta: annotationIn(view.resolve, entriesOf(fn), JAKARTA_TRANSACTIONAL),
    inherited:
      owner === undefined
        ? undefined
        : annotationIn(view.resolve, owner.annotations, SPRING_TRANSACTIONAL),
    inheritedJakarta:
      owner === undefined
        ? undefined
        : annotationIn(view.resolve, owner.annotations, JAKARTA_TRANSACTIONAL),
  };
}

export function anyTransactional(view, entries) {
  return (
    annotationIn(view.resolve, entries, SPRING_TRANSACTIONAL) !== undefined ||
    annotationIn(view.resolve, entries, JAKARTA_TRANSACTIONAL) !== undefined
  );
}

function writingSpring(annotation) {
  return (
    !isTrue(argumentOf(annotation, 'readOnly')) &&
    !NO_TRANSACTION.test(argumentOf(annotation, 'propagation') ?? '')
  );
}

function writingJakarta(annotation) {
  return !NO_TRANSACTION.test(argumentOf(annotation, 'value', { positional: true }) ?? '');
}

export function runsInTransaction(view, fn) {
  const { own, jakarta, inherited, inheritedJakarta } = transactionOf(view, fn);
  if (own !== undefined || jakarta !== undefined) {
    return own === undefined ? writingJakarta(jakarta) : writingSpring(own);
  }
  return (
    fn.visibility === 'public' &&
    ((inherited !== undefined && writingSpring(inherited)) ||
      (inheritedJakarta !== undefined && writingJakarta(inheritedJakarta)))
  );
}

function templateLambda(view, scope) {
  return (
    scope.k === 'lambda' &&
    TEMPLATE_CALLS.has(scope.host) &&
    scope.qualifier !== undefined &&
    view.is(view.typeOf(scope.parent, scope.qualifier), TRANSACTION_TEMPLATES)
  );
}

export function placeOf(view, scopeId) {
  for (const scope of view.chain(scopeId)) {
    if (templateLambda(view, scope)) {
      return { template: true };
    }
    if (scope.k === 'object' || (scope.k === 'lambda' && AFTER_COMMIT.test(scope.host ?? ''))) {
      return { deferred: true };
    }
    if (scope.k === 'fun' && view.chain(scope.parent)[0]?.k === 'class') {
      return { fn: view.functionOf(scope) };
    }
    if (scope.k === 'class') {
      return {};
    }
  }
  return {};
}

function calledFrom(view, fn, accepts) {
  return view.file.invocations.some(
    (invocation) =>
      invocation.name === fn.name &&
      isSelfCall(view, invocation) &&
      acceptsArguments(fn, invocation.arguments.length) &&
      ownerOf(view, invocation) === fn.owner &&
      accepts(placeOf(view, invocation.scope)),
  );
}

export function helperCalls(view, fn) {
  return view.file.invocations.flatMap((invocation) => {
    if (!isSelfCall(view, invocation) || placeOf(view, invocation.scope).fn !== fn) {
      return [];
    }
    const helper = view.file.functions.find(
      (candidate) =>
        candidate !== fn &&
        candidate.name === invocation.name &&
        candidate.owner === fn.owner &&
        candidate.visibility !== 'public' &&
        acceptsArguments(candidate, invocation.arguments.length),
    );
    return helper === undefined ? [] : [{ call: invocation, helper }];
  });
}

const TRANSACTIONAL_NAME = /(?:^|\.)Transactional$/u;
const SEARCH_LIMIT = 16;

export function inheritsTransactional(view, declared) {
  const queue = [declared];
  for (const current of queue) {
    if (
      current !== declared &&
      current.annotations.some(({ type, name }) => TRANSACTIONAL_NAME.test(type ?? name))
    ) {
      return true;
    }
    const supers = (current.supers ?? [])
      .map((type) => view.projectClass(typeName(type))?.declared)
      .filter((next) => next !== undefined && !queue.includes(next));
    queue.push(...(queue.length < SEARCH_LIMIT ? supers : []));
  }
  return false;
}

export function inWritingTransaction(view, scopeId) {
  const place = placeOf(view, scopeId);
  if (place.template === true) {
    return true;
  }
  const { fn } = place;
  return (
    fn !== undefined &&
    (runsInTransaction(view, fn) ||
      (fn.visibility !== 'public' &&
        calledFrom(
          view,
          fn,
          (caller) => caller.fn !== undefined && runsInTransaction(view, caller.fn),
        )))
  );
}
