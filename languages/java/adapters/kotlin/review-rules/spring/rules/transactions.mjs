import { annotationIn, argumentOf, isTrue, typeName } from '../spring-names.mjs';
import { acceptsArguments, entriesOf, isSelfCall, ownerOf, symbolOf } from '../spring-scopes.mjs';
import {
  ENTITY_MANAGER,
  JAKARTA_TRANSACTIONAL,
  PERSISTENCE_EXCEPTIONS,
  SPRING_TRANSACTIONAL,
} from '../spring-types.mjs';

const BROAD = new Set([
  'kotlin.Exception',
  'kotlin.RuntimeException',
  'kotlin.Throwable',
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.Throwable',
]);
const RETHROWING = new Set(['getOrElse', 'onFailure', 'fold', 'recover', 'recoverCatching']);
const CHECKED = new Set([
  'Exception',
  'Throwable',
  'IOException',
  'FileNotFoundException',
  'EOFException',
  'MalformedURLException',
  'URISyntaxException',
  'SQLException',
  'TimeoutException',
  'InterruptedException',
  'ExecutionException',
  'GeneralSecurityException',
  'ParseException',
  'ClassNotFoundException',
  'CloneNotSupportedException',
  'ReflectiveOperationException',
  'JsonProcessingException',
  'MessagingException',
]);
const UNCHECKED = new Set(['RuntimeException', 'Error']);
const CLASS_LITERAL = /([\w.]+)::class/gu;
const WRITES = new Set([
  'save',
  'saveAll',
  'saveAndFlush',
  'saveAllAndFlush',
  'delete',
  'deleteAll',
  'deleteById',
  'deleteAllById',
  'deleteAllInBatch',
  'persist',
  'merge',
  'remove',
]);
export const WRITE_VERB =
  /^(?:update|delete|remove|mark|set|rename|insert|upsert|increment|decrement|reset|clear|purge|archive|touch)/u;
const DEPTH = 8;

function transactionOf(view, fn) {
  const owner = view.classes.get(fn.owner);
  return {
    own: annotationIn(view.resolve, entriesOf(fn), SPRING_TRANSACTIONAL),
    jakarta: annotationIn(view.resolve, entriesOf(fn), JAKARTA_TRANSACTIONAL),
    inherited:
      owner === undefined
        ? undefined
        : annotationIn(view.resolve, owner.annotations, SPRING_TRANSACTIONAL),
  };
}

function transactionalFunctions(view) {
  const direct = new Set(
    view.file.functions.filter((fn) => {
      const { own, inherited } = transactionOf(view, fn);
      return own !== undefined || inherited !== undefined;
    }),
  );
  const helpers = view.file.functions.filter(
    (fn) =>
      fn.visibility !== 'public' &&
      view.file.invocations.some(
        (invocation) =>
          invocation.name === fn.name &&
          isSelfCall(view, invocation) &&
          acceptsArguments(fn, invocation.arguments.length) &&
          ownerOf(view, invocation) === fn.owner &&
          direct.has(view.functionAt(invocation.scope)),
      ),
  );
  return new Set([...direct, ...helpers]);
}

function directlyIn(view, scopeId) {
  for (const scope of view.chain(scopeId)) {
    if (scope.k === 'fun') {
      return true;
    }
    if (scope.k === 'lambda' || scope.k === 'object') {
      return false;
    }
  }
  return false;
}

function broadCatch(view, type) {
  return view
    .resolve(typeName(type))
    .some(
      (name) => BROAD.has(name) || PERSISTENCE_EXCEPTIONS.some((pattern) => pattern.test(name)),
    );
}

function rethrows(invocation) {
  return (
    invocation.name === 'getOrThrow' ||
    (invocation.after ?? []).includes('getOrThrow') ||
    (RETHROWING.has(invocation.name) && invocation.throwing === true) ||
    (invocation.afterThrowing ?? []).some((name) => RETHROWING.has(name))
  );
}

function resultRethrown(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  return (
    rethrows(invocation) ||
    (invocation.assignedTo !== undefined &&
      view.file.invocations.some(
        (other) =>
          other.receiver === invocation.assignedTo &&
          other.line >= invocation.line &&
          view.functionAt(other.scope) === fn &&
          rethrows(other),
      ))
  );
}

function swallowed(view) {
  const transactional = transactionalFunctions(view);
  function inTransaction(scopeId) {
    return transactional.has(view.functionAt(scopeId)) && directlyIn(view, scopeId);
  }
  const catches = view.file.catches
    .filter(
      (clause) => !clause.throws && inTransaction(clause.scope) && broadCatch(view, clause.type),
    )
    .map((clause) => ({ line: clause.line, symbol: symbolOf(view, clause.scope, clause.name) }));
  const results = view.file.invocations
    .filter((invocation) => invocation.name === 'runCatching' && inTransaction(invocation.scope))
    .filter((invocation) => !resultRethrown(view, invocation))
    .map((invocation) => ({
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, 'runCatching'),
    }));
  return [...catches, ...results].map((site) => ({
    rule: 'SpringNoSwallowedTransactionException',
    ...site,
  }));
}

function exceptionSupers(files) {
  return new Map(
    files
      .flatMap((file) => file.classes)
      .filter((declared) => declared.superClass !== undefined)
      .map((declared) => [declared.name, typeName(declared.superClass).split('.').at(-1)]),
  );
}

function superChain(name, supers) {
  return Array.from({ length: DEPTH }).reduce(
    (chain) => {
      const next = supers.get(chain.at(-1));
      return next === undefined || chain.includes(next) ? chain : [...chain, next];
    },
    [name],
  );
}

function isChecked(name, supers) {
  const known = superChain(name, supers).find((type) => UNCHECKED.has(type) || CHECKED.has(type));
  return known !== undefined && CHECKED.has(known);
}

function rollsBack(annotation) {
  return (
    annotation.arguments.some(({ name }) =>
      ['rollbackFor', 'rollbackForClassName'].includes(name),
    ) || isTrue(argumentOf(annotation, 'readOnly'))
  );
}

function thrownTypes(view, fn) {
  const thrown = annotationIn(
    view.resolve,
    entriesOf(fn),
    new Set(['kotlin.jvm.Throws', 'kotlin.Throws']),
  );
  return [
    ...[...(thrown?.arguments ?? []).flatMap(({ text }) => [...text.matchAll(CLASS_LITERAL)])].map(
      (match) => match[1],
    ),
    ...(view.file.throws ?? [])
      .filter(({ scope, caught }) => caught !== true && view.functionAt(scope) === fn)
      .map(({ type }) => type),
  ].map((type) => type.split('.').at(-1));
}

function checkedRollback(view, { projectFiles }) {
  const supers = exceptionSupers(projectFiles);
  return view.file.functions.flatMap((fn) => {
    if (!thrownTypes(view, fn).some((type) => isChecked(type, supers))) {
      return [];
    }
    const { own, inherited } = transactionOf(view, fn);
    const governing = own ?? (fn.visibility === 'public' ? inherited : undefined);
    return governing !== undefined && !rollsBack(governing)
      ? [
          {
            rule: 'SpringTransactionalCheckedRollback',
            line: fn.line,
            symbol: `${fn.owner}.${fn.name}`,
          },
        ]
      : [];
  });
}

function readOnly(annotation) {
  return annotation !== undefined && isTrue(argumentOf(annotation, 'readOnly'));
}

function readOnlyWrites(view) {
  return view.file.invocations.flatMap((invocation) => {
    const fn = view.functionAt(invocation.scope);
    if (fn === undefined) {
      return [];
    }
    const { own, jakarta, inherited } = transactionOf(view, fn);
    const underReadOnly =
      readOnly(own) || (own === undefined && jakarta === undefined && readOnly(inherited));
    const type = view.typeOf(invocation.scope, invocation.receiver);
    const repository = type !== undefined && view.isRepository(type);
    const write =
      (WRITES.has(invocation.name) && (repository || view.is(type, ENTITY_MANAGER))) ||
      (WRITE_VERB.test(invocation.name) && repository);
    return underReadOnly && write
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

export const TRANSACTION_RULES = [swallowed, checkedRollback, readOnlyWrites];
