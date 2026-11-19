import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import type { Fqns, SpringView } from '../../spring/typed/spring-shapes.mts';
import {
  CACHING_CALLS,
  CONSTANT_PATTERN_FACTORIES,
  REUSABLE_CONSTRUCTORS,
  REUSABLE_FACTORIES,
  REUSABLE_OBJECT_RULE,
  REUSABLE_RESULT_TYPES,
  SETUP_ANNOTATIONS,
  SETUP_METHODS,
} from '../../../../../messages/reuse/reusable-objects.mts';
import { annotationIn, stringValue } from '../../spring/spring-names.mts';
import { entriesOf, setupScopes, symbolOf } from '../../spring/spring-scopes.mts';
import { ruleViews } from '../../spring/view/spring-view.mts';

type Invocation = SpringView['file']['invocations'][number];
type FunctionFact = SpringView['file']['functions'][number];
type FactoryEntry = [Fqns, readonly string[]];

const KOTLIN_CONSTRUCTORS = [
  'com.fasterxml.jackson.module.kotlin.jacksonObjectMapper',
  'com.fasterxml.jackson.module.kotlin.jacksonMapperBuilder',
  'com.fasterxml.jackson.module.kotlin.jsonMapper',
  'kotlinx.serialization.json.Json',
];
const KOTLIN_PATTERN_CONSTRUCTORS = ['kotlin.text.Regex'];
const KOTLIN_PATTERN_FACTORIES: [string, string[]][] = [['java.util.regex.Pattern', ['compile']]];

const CONSTRUCTED = new Set([...REUSABLE_CONSTRUCTORS, ...KOTLIN_CONSTRUCTORS]);
const PATTERN_CONSTRUCTED = new Set(KOTLIN_PATTERN_CONSTRUCTORS);
function factoryEntries(
  rows: readonly (readonly (string | readonly string[])[])[],
): FactoryEntry[] {
  return rows.flatMap(([type, names]): FactoryEntry[] =>
    typeof type === 'string' && names !== undefined && typeof names !== 'string'
      ? [[new Set([type]), names]]
      : [],
  );
}

const FACTORIES = factoryEntries(REUSABLE_FACTORIES);
const PATTERN_FACTORIES = factoryEntries([
  ...CONSTANT_PATTERN_FACTORIES,
  ...KOTLIN_PATTERN_FACTORIES,
]);
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

function calledName(invocation: Invocation): string | undefined {
  if (invocation.receiver === undefined) {
    return invocation.name;
  }
  return PACKAGE.test(invocation.receiver)
    ? `${invocation.receiver}.${invocation.name}`
    : undefined;
}

function constant(text: string | undefined): boolean {
  const trimmed = (text ?? '').trim();
  return stringValue(trimmed) !== undefined || CONSTANT_NAME.test(trimmed);
}

function factory(view: SpringView, invocation: Invocation, factories: FactoryEntry[]): boolean {
  return (
    invocation.receiver !== undefined &&
    factories.some(
      ([fqns, names]) => names.includes(invocation.name) && view.is(invocation.receiver, fqns),
    )
  );
}

function constantPattern(view: SpringView, invocation: Invocation): boolean {
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

function builds(view: SpringView, invocation: Invocation): boolean {
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

function returnsShared(fn: FunctionFact): boolean {
  return (fn.returnType ?? '').match(WORD)?.some((word) => RESULT_TYPES.has(word)) === true;
}

function isStart(view: SpringView, fn: FunctionFact): boolean {
  return (
    annotationIn(view.resolve, entriesOf(fn), SETUP) !== undefined ||
    (fn.parameters.length === 0 && SETUP_NAMES.has(fn.name)) ||
    fn.name === 'main' ||
    returnsShared(fn)
  );
}

function cached(view: SpringView, invocation: Invocation): boolean {
  const fn = view.functionAt(invocation.scope);
  return view
    .chain(invocation.scope)
    .some(
      (scope) =>
        scope.k === 'lambda' &&
        scope.host !== undefined &&
        CACHING_HOSTS.has(scope.host) &&
        view.functionAt(scope.id) === fn,
    );
}

function keptInProperty(view: SpringView, invocation: Invocation): boolean {
  const target = invocation.assignedTo?.replace(THIS, '');
  if (target === undefined) {
    return false;
  }
  const fn = view.functionAt(invocation.scope);
  const ownProperty = invocation.assignedTo?.startsWith('this.') === true;
  return ownProperty || (fn !== undefined && !view.declaresLocally(invocation.scope, target));
}

function returnedByFactory(view: SpringView, invocation: Invocation): boolean {
  const fn = view.functionAt(invocation.scope);
  return (
    fn !== undefined &&
    fn.returnType === undefined &&
    invocation.returned === true &&
    (invocation.after ?? []).length === 0
  );
}

function fromCall(view: SpringView, invocation: Invocation): boolean {
  return invocation.arguments.some(
    ({ text }) =>
      IDENTIFIER.test(text.trim()) && view.declaresLocally(invocation.scope, text.trim()),
  );
}

function allowed(
  view: SpringView,
  setup: (scope: number | undefined) => boolean,
  invocation: Invocation,
): boolean {
  return (
    setup(invocation.scope) ||
    cached(view, invocation) ||
    keptInProperty(view, invocation) ||
    returnedByFactory(view, invocation) ||
    fromCall(view, invocation)
  );
}

function perCallObjects(view: SpringView): { line: number; symbol: string }[] {
  if (view.file.test) {
    return [];
  }
  const setup = setupScopes(view, (fn) => isStart(view, fn));
  return view.file.invocations
    .filter((invocation) => builds(view, invocation))
    .filter((invocation) => !allowed(view, setup, invocation))
    .map((invocation) => ({
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

export function reusableObjectFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  return ruleViews(files, declaredIn).flatMap((view) =>
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
