import {
  AWAITILITY_ADVICE,
  FIXED_SLEEP_RULE,
  timedWaitAdvice,
} from '../../../../messages/wait-advice.mts';
import { importsFrom, insideClass } from '../kotlin-facts.mts';
import type { KotlinFile, ParameterFact } from '../typed/kotlin-fact-types.mts';
import type { ReviewFinding } from '../typed/review-finding-types.mts';
import {
  SLEEP_MESSAGE,
  DELAY_MESSAGE,
  NEGATIVE_MESSAGE,
  SPARED_HOSTS,
  INLINE_HOSTS,
  VIRTUAL_TIME_HOSTS,
  THREAD_TYPES,
  NEGATIVE_FOLLOWERS,
  IMPORTED_SLEEP,
  IMPORTED_PARK,
  DURATION_ARGUMENT,
  DELAY_ARGUMENT,
  MOCKITO_QUALIFIER,
  THREAD_QUALIFIER,
  TIME_UNIT_QUALIFIER,
  LOCK_SUPPORT,
  BOUNDARIES,
  TYPE_FRAMES,
  TEST_ANNOTATIONS,
  SLEEP_ARGUMENTS,
  SLEEP,
  TIMED,
  LAMBDA,
} from './wait-constants.mts';
import type {
  WaitClassifier,
  WaitContext,
  WaitFact,
  WaitFound,
  WaitOptions,
  WaitScope,
  SpareContext,
} from './typed/rule-types.mts';

export const NEGATIVE_WAIT_RULE = 'NegativeWaitInTest';

function fixed(kind: string, exemptable = false): WaitFound {
  return { rule: FIXED_SLEEP_RULE, kind, exemptable };
}
const negative: WaitFound = { rule: NEGATIVE_WAIT_RULE, kind: 'negative', exemptable: false };

function contextOf(file: KotlinFile, wait: WaitFact, declared: Set<string>): WaitContext {
  return {
    mockito: importsFrom(file, 'org.mockito'),
    awaitility: importsFrom(file, 'org.awaitility'),
    kotest: importsFrom(file, 'io.kotest'),
    playwright: importsFrom(file, 'com.microsoft.playwright'),
    timeUnit:
      importsFrom(file, 'java.util.concurrent.TimeUnit') && /^[A-Z]+$/u.test(wait.qualifier ?? ''),
    unqualified: wait.qualifier === undefined,
    shadowed: wait.qualifier === undefined && declared.has(wait.name),
  };
}

function isZeroTimes(outer: WaitFact['outer']): boolean {
  return (
    outer?.name === 'times' && outer.arguments.length === 1 && outer.arguments[0]?.text === '0'
  );
}

function isMilliseconds(text: string): boolean {
  return !DURATION_ARGUMENT.test(text) && DELAY_ARGUMENT.test(text);
}

function isDelay(wait: WaitFact): boolean {
  return wait.arguments.length === 1 && DELAY_ARGUMENT.test(wait.arguments[0]?.text ?? '');
}

function hasName(names: ReadonlySet<string>, name: string | undefined): boolean {
  return name !== undefined && names.has(name);
}

function isNegativeFollower(outer: WaitFact['outer']): boolean {
  return hasName(NEGATIVE_FOLLOWERS, outer?.name) || isZeroTimes(outer);
}

function threadSleep(wait: WaitFact, context: WaitContext): WaitFound | undefined {
  const qualifier = wait.qualifier ?? '';
  const known =
    THREAD_QUALIFIER.test(qualifier) ||
    TIME_UNIT_QUALIFIER.test(qualifier) ||
    context.timeUnit ||
    (context.unqualified && IMPORTED_SLEEP.test(wait.imported ?? ''));
  return wait.arguments.length <= SLEEP_ARGUMENTS && known ? fixed(SLEEP, true) : undefined;
}

const CLASSIFIERS: Record<string, WaitClassifier> = {
  sleep: threadSleep,
  parkNanos: (wait) =>
    LOCK_SUPPORT.test(wait.qualifier ?? '') || IMPORTED_PARK.test(wait.imported ?? '')
      ? fixed(SLEEP, true)
      : undefined,
  join: (wait, context) =>
    wait.arguments.length === 1 &&
    (wait.statement || isMilliseconds(wait.arguments[0]?.text ?? '')) &&
    !context.shadowed
      ? fixed(TIMED, true)
      : undefined,
  wait: (wait, context) =>
    wait.arguments.length >= 1 && !context.shadowed ? fixed(TIMED, true) : undefined,
  delay: (_wait, context) =>
    context.unqualified && !context.shadowed ? fixed('delay', true) : undefined,
  after: (wait, context) => {
    const mockitoCall = context.unqualified || MOCKITO_QUALIFIER.test(wait.qualifier ?? '');
    if (!context.mockito || context.shadowed || !mockitoCall || !isDelay(wait)) {
      return undefined;
    }
    return isNegativeFollower(wait.outer) ? negative : fixed(SLEEP);
  },
  waitForTimeout: (_wait, context) => (context.playwright ? fixed(SLEEP) : undefined),
  until: (wait, context) =>
    context.awaitility && wait.lambda === 'true' ? fixed(SLEEP) : undefined,
  during: (wait, context) =>
    context.awaitility && wait.arguments.length === 1 ? negative : undefined,
  continually: (_wait, context) => (context.kotest && context.unqualified ? negative : undefined),
};

function classify(wait: WaitFact, file: KotlinFile, declared: Set<string>): WaitFound | undefined {
  return CLASSIFIERS[wait.name]?.(wait, contextOf(file, wait, declared));
}

function isPolling(loop: WaitScope): boolean {
  return loop.condition !== 'true' || loop.clock === true;
}

function runsInRunBlocking(wait: WaitFact): boolean {
  const host = wait.scopes
    .filter((scope) => scope.k === LAMBDA)
    .map((scope) => scope.host)
    .find((name) => name === 'runBlocking' || hasName(VIRTUAL_TIME_HOSTS, name));
  return host === 'runBlocking';
}

function ownerOf(wait: WaitFact): WaitScope | undefined {
  return wait.scopes.find((scope) => TYPE_FRAMES.has(scope.k));
}

function isTestClass(owner: WaitScope, file: KotlinFile): boolean {
  const { qualified } = owner;
  return (
    owner.k === 'class' &&
    qualified !== undefined &&
    file.functions.some(
      (fn) =>
        insideClass(fn.owner, qualified) &&
        (fn.annotations ?? []).some((name) => TEST_ANNOTATIONS.has(name)),
    )
  );
}

function isBoundary(scope: WaitScope, inlineHosts: ReadonlySet<string>): boolean {
  return (
    BOUNDARIES.has(scope.k) &&
    !(scope.k === LAMBDA && (hasName(INLINE_HOSTS, scope.host) || hasName(inlineHosts, scope.host)))
  );
}

function isSpared(wait: WaitFact, { file, isProduction, inlineHosts }: SpareContext): boolean {
  const boundary = wait.scopes.find((scope) => isBoundary(scope, inlineHosts));
  const owner = ownerOf(wait);
  if (boundary?.k === 'loop' && isPolling(boundary)) {
    return true;
  }
  if (boundary?.k === LAMBDA && hasName(SPARED_HOSTS, boundary.host)) {
    return true;
  }
  if (
    boundary?.k === 'fun' &&
    boundary.name === 'run' &&
    owner?.supers.some((name) => THREAD_TYPES.has(name))
  ) {
    return true;
  }
  return (
    owner !== undefined &&
    !isTestClass(owner, file) &&
    owner.supers.some((name) => isProduction(name, file))
  );
}

export function isSparedHost(name: string): boolean {
  return SPARED_HOSTS.has(name);
}

export function isInlineHost(name: string): boolean {
  return INLINE_HOSTS.has(name);
}

export function waitMessage(found: WaitFound, { awaitility }: { awaitility: boolean }): string {
  const { rule, kind } = found;
  if (rule === NEGATIVE_WAIT_RULE) {
    return NEGATIVE_MESSAGE;
  }
  if (kind === TIMED) {
    return timedWaitAdvice({ awaitility });
  }
  if (kind === SLEEP && awaitility) {
    return AWAITILITY_ADVICE;
  }
  return kind === SLEEP ? SLEEP_MESSAGE : DELAY_MESSAGE;
}

function symbolOf(wait: WaitFact): string {
  const fn = wait.scopes.find((scope) => scope.k === 'fun');
  const owner = ownerOf(wait);
  return [owner?.qualified ?? owner?.name, fn?.name]
    .filter((part) => part !== undefined && part !== '')
    .join('.');
}

function isWait(value: unknown): value is WaitFact {
  return typeof value === 'object' && value !== null && 'name' in value && 'scopes' in value;
}

function waitsOf(file: KotlinFile): WaitFact[] {
  const waits: unknown = Reflect.get(file, 'waits');
  return Array.isArray(waits) ? waits.filter(isWait) : [];
}

function projectFunctionNames(files: KotlinFile[]): Set<string> {
  return new Set(files.flatMap((file) => file.functions.map(({ name }) => name)));
}

function projectInlineHosts(files: KotlinFile[]): Set<string> {
  const inlined = new Map<string, boolean>();
  for (const { name, modifiers, parameters } of files.flatMap((file) => file.functions)) {
    const loose: (ParameterFact & { inlining?: string | undefined })[] = parameters;
    const looked =
      modifiers.includes('inline') && loose.every(({ inlining }) => inlining === undefined);
    inlined.set(name, (inlined.get(name) ?? true) && looked);
  }
  return new Set(
    [...inlined]
      .filter(([name, looked]) => looked && !SPARED_HOSTS.has(name))
      .map(([name]) => name),
  );
}

function isReported(
  found: WaitFound | undefined,
  wait: WaitFact,
  context: SpareContext,
): found is WaitFound {
  if (found === undefined) {
    return false;
  }
  if (found.kind === 'delay' && !runsInRunBlocking(wait)) {
    return false;
  }
  return !(found.exemptable && isSpared(wait, context));
}

export function testWaitFindings(
  files: KotlinFile[],
  { isProduction, finding, awaitility, declaredIn = files }: WaitOptions,
): ReviewFinding[] {
  const declared = projectFunctionNames(files);
  const inlineHosts = projectInlineHosts(declaredIn);
  return files
    .filter(({ test }) => test)
    .flatMap((file) =>
      waitsOf(file).flatMap((wait) => {
        const found = classify(wait, file, declared);
        if (!isReported(found, wait, { file, isProduction, inlineHosts })) {
          return [];
        }
        const symbol = symbolOf(wait);
        return [
          finding({
            rule: found.rule,
            file: file.file,
            line: wait.line,
            symbol,
            key: `${symbol}:${wait.name}`,
            message: waitMessage(found, { awaitility }),
          }),
        ];
      }),
    );
}
