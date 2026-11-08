import {
  CACHING_CALLS,
  CONSTANT_PATTERN_FACTORIES,
  REUSABLE_CONSTRUCTORS,
  REUSABLE_FACTORIES,
  REUSABLE_OBJECT_RULE,
  REUSABLE_RESULT_TYPES,
  SETUP_ANNOTATIONS,
  SETUP_METHODS,
} from '../../../../../messages/reuse/reusable-objects.mjs';
import { annotationIn, stringValue, typeName } from '../../spring/spring-names.mjs';
import { entriesOf, setupScopes, symbolOf } from '../../spring/spring-scopes.mjs';
import { springViews } from '../../spring/view/spring-view.mjs';

const KOTLIN_CONSTRUCTORS = [
  'com.fasterxml.jackson.module.kotlin.jacksonObjectMapper',
  'com.fasterxml.jackson.module.kotlin.jacksonMapperBuilder',
  'com.fasterxml.jackson.module.kotlin.jsonMapper',
  'kotlinx.serialization.json.Json',
];
const KOTLIN_PATTERN_CONSTRUCTORS = ['kotlin.text.Regex'];
const KOTLIN_PATTERN_FACTORIES = [['java.util.regex.Pattern', ['compile']]];

const CONSTRUCTED = new Set([...REUSABLE_CONSTRUCTORS, ...KOTLIN_CONSTRUCTORS]);
const PATTERN_CONSTRUCTED = new Set(KOTLIN_PATTERN_CONSTRUCTORS);
const FACTORIES = REUSABLE_FACTORIES.map(([type, names]) => [new Set([type]), names]);
const PATTERN_FACTORIES = [...CONSTANT_PATTERN_FACTORIES, ...KOTLIN_PATTERN_FACTORIES].map(
  ([type, names]) => [new Set([type]), names],
);
const RESULT_TYPES = new Set([...REUSABLE_RESULT_TYPES, 'Regex', 'Pattern', 'Json']);
const SETUP = new Set(SETUP_ANNOTATIONS);
const SETUP_NAMES = new Set(SETUP_METHODS);
const CACHING_HOSTS = new Set([...CACHING_CALLS, 'lazy', 'getOrPut', 'remember']);
export const KOTLIN_REUSABLE_OBJECT_MESSAGE =
  'Build this once and reuse it: once built it is safe to share between threads, and building it costs far more than using it. Keep it in a top-level or companion val, a property, a by lazy delegate, or a @Bean.';
const WORD = /\w+/gu;
const IDENTIFIER = /^[a-z_]\w*$/u;
const CONSTANT_NAME = /^[A-Z][A-Z\d_]*$/u;
const PACKAGE = /^[a-z_]\w*(?:\.[a-z_]\w*)*$/u;
const THIS = /^this\./u;
const TO_REGEX = 'toRegex';

function calledName(invocation) {
  if (invocation.receiver === undefined) {
    return invocation.name;
  }
  return PACKAGE.test(invocation.receiver)
    ? `${invocation.receiver}.${invocation.name}`
    : undefined;
}

function constant(text) {
  const trimmed = (text ?? '').trim();
  return stringValue(trimmed) !== undefined || CONSTANT_NAME.test(trimmed);
}

function factory(view, invocation, factories) {
  return (
    invocation.receiver !== undefined &&
    factories.some(
      ([fqns, names]) => names.includes(invocation.name) && view.is(invocation.receiver, fqns),
    )
  );
}

function constantPattern(view, invocation) {
  const [first] = invocation.arguments;
  if (invocation.name === TO_REGEX) {
    return invocation.arguments.length === 0 && stringValue(invocation.receiver) !== undefined;
  }
  if (first === undefined || !constant(first.text)) {
    return false;
  }
  const name = calledName(invocation);
  return (
    (name !== undefined && view.is(name, PATTERN_CONSTRUCTED)) ||
    factory(view, invocation, PATTERN_FACTORIES)
  );
}

function builds(view, invocation) {
  if (invocation.assign === true || invocation.reference === true) {
    return false;
  }
  const name = calledName(invocation);
  return (
    (name !== undefined && view.is(name, CONSTRUCTED)) ||
    factory(view, invocation, FACTORIES) ||
    constantPattern(view, invocation)
  );
}

function returnsShared(fn) {
  return (fn.returnType ?? '').match(WORD)?.some((word) => RESULT_TYPES.has(word)) === true;
}

function isStart(view, fn) {
  return (
    annotationIn(view.resolve, entriesOf(fn), SETUP) !== undefined ||
    (fn.parameters.length === 0 && SETUP_NAMES.has(fn.name)) ||
    fn.name === 'main' ||
    returnsShared(fn)
  );
}

function cached(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  return view
    .chain(invocation.scope)
    .some(
      (scope) =>
        scope.k === 'lambda' && CACHING_HOSTS.has(scope.host) && view.functionAt(scope.id) === fn,
    );
}

function keptInProperty(view, invocation) {
  const target = invocation.assignedTo?.replace(THIS, '');
  if (target === undefined) {
    return false;
  }
  const fn = view.functionAt(invocation.scope);
  const ownProperty = invocation.assignedTo.startsWith('this.');
  return ownProperty || (fn !== undefined && !view.declaresLocally(invocation.scope, target));
}

function returnedByFactory(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  return (
    fn !== undefined &&
    (fn.returnType ?? undefined) === undefined &&
    invocation.returned === true &&
    (invocation.after ?? []).length === 0
  );
}

function fromCall(view, invocation) {
  return invocation.arguments.some(
    ({ text }) =>
      IDENTIFIER.test((text ?? '').trim()) && view.declaresLocally(invocation.scope, text.trim()),
  );
}

function perCallObjects(view) {
  if (view.file.test) {
    return [];
  }
  const setup = setupScopes(view, (fn) => isStart(view, fn));
  return view.file.invocations
    .filter((invocation) => builds(view, invocation))
    .filter(
      (invocation) =>
        !setup(invocation.scope) &&
        !cached(view, invocation) &&
        !keptInProperty(view, invocation) &&
        !returnedByFactory(view, invocation) &&
        !fromCall(view, invocation),
    )
    .map((invocation) => ({
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

export function reusableObjectFindings(files, { finding, declaredIn = files }) {
  return springViews({ files, projectFiles: declaredIn, projectRoot: '', javaRoots: [] }).flatMap(
    (view) =>
      perCallObjects(view).map(({ line, symbol }) =>
        finding({
          rule: REUSABLE_OBJECT_RULE,
          file: view.file.file,
          line,
          symbol,
          message: KOTLIN_REUSABLE_OBJECT_MESSAGE,
        }),
      ),
  );
}
