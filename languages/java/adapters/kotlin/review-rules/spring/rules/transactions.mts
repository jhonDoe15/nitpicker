import { annotationIn, argumentOf, isTrue, typeName } from '../spring-names.mts';
import { acceptsArguments, entriesOf, isSelfCall, ownerOf, symbolOf } from '../spring-scopes.mts';
import { PERSISTENCE_EXCEPTIONS } from '../spring-types.mts';
import { transactionOf } from '../transactions/scope.mts';
import { readOnlyWrites } from './read-only-writes.mts';
import type {
  Annotation,
  FunctionFact,
  InvocationFact,
  Reported,
  RuleOptions,
  SourceFile,
  SpringView,
} from '../typed/spring-shapes.mts';

const BROAD = new Set([
  'kotlin.Exception',
  'kotlin.RuntimeException',
  'kotlin.Throwable',
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.Throwable',
]);
const RETHROWING = new Set(['getOrElse', 'onFailure', 'fold', 'recover', 'recoverCatching']);
const CHECKED = new Set<string | undefined>([
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
const UNCHECKED = new Set<string | undefined>(['RuntimeException', 'Error']);
const CLASS_LITERAL = /([\w.]+)::class/gu;
const DEPTH = 8;

function transactionalFunctions(view: SpringView): Set<FunctionFact | undefined> {
  const direct = new Set<FunctionFact | undefined>(
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

function directlyIn(view: SpringView, scopeId: number | undefined): boolean {
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

function broadCatch(view: SpringView, type: string): boolean {
  return view
    .resolve(typeName(type))
    .some(
      (name) => BROAD.has(name) || PERSISTENCE_EXCEPTIONS.some((pattern) => pattern.test(name)),
    );
}

function rethrows(invocation: InvocationFact): boolean {
  return (
    invocation.name === 'getOrThrow' ||
    (invocation.after ?? []).includes('getOrThrow') ||
    (RETHROWING.has(invocation.name) && invocation.throwing === true) ||
    (invocation.afterThrowing ?? []).some((name) => RETHROWING.has(name))
  );
}

function resultRethrown(view: SpringView, invocation: InvocationFact): boolean {
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

function swallowed(view: SpringView): Reported[] {
  const transactional = transactionalFunctions(view);
  function inTransaction(scopeId: number): boolean {
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

function exceptionSupers(files: SourceFile[]): Map<string | undefined, string | undefined> {
  return new Map(
    files
      .flatMap((file) => file.classes)
      .filter((declared) => declared.superClass !== undefined)
      .map((declared): [string | undefined, string | undefined] => [
        declared.name,
        typeName(declared.superClass).split('.').at(-1),
      ]),
  );
}

function superChain(
  name: string | undefined,
  supers: Map<string | undefined, string | undefined>,
): (string | undefined)[] {
  return Array.from({ length: DEPTH }).reduce<(string | undefined)[]>(
    (chain) => {
      const next = supers.get(chain.at(-1));
      return next === undefined || chain.includes(next) ? chain : [...chain, next];
    },
    [name],
  );
}

function isChecked(
  name: string | undefined,
  supers: Map<string | undefined, string | undefined>,
): boolean {
  const known = superChain(name, supers).find((type) => UNCHECKED.has(type) || CHECKED.has(type));
  return known !== undefined && CHECKED.has(known);
}

function rollsBack(annotation: Annotation): boolean {
  return (
    annotation.arguments.some(
      ({ name }) => name !== undefined && ['rollbackFor', 'rollbackForClassName'].includes(name),
    ) || isTrue(argumentOf(annotation, 'readOnly'))
  );
}

function thrownTypes(view: SpringView, fn: FunctionFact): (string | undefined)[] {
  const thrown = annotationIn(
    view.resolve,
    entriesOf(fn),
    new Set(['kotlin.jvm.Throws', 'kotlin.Throws']),
  );
  return [
    ...[...(thrown?.arguments ?? []).flatMap(({ text }) => [...text.matchAll(CLASS_LITERAL)])].map(
      (match) => match[1] ?? '',
    ),
    ...(view.file.throws ?? [])
      .filter(({ scope, caught }) => caught !== true && view.functionAt(scope) === fn)
      .map(({ type }) => type),
  ].map((type) => type.split('.').at(-1));
}

function checkedRollback(view: SpringView, { projectFiles }: RuleOptions): Reported[] {
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

export const TRANSACTION_RULES = [swallowed, checkedRollback, readOnlyWrites];
