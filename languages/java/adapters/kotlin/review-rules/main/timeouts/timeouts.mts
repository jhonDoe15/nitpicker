import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import type {
  AwaitedWork,
  TimeoutEntry,
  TimeoutHandler,
  TimeoutProblem,
  TimeoutSource,
  TimeoutStop,
} from './timeout-types.mts';

export const TIMEOUT_RULE = 'timeout-abandons-operation';

const COROUTINES = 'kotlinx.coroutines';
const TIME_UNIT = 'java.util.concurrent.TimeUnit';
const UNITS = new Set([
  'NANOSECONDS',
  'MICROSECONDS',
  'MILLISECONDS',
  'SECONDS',
  'MINUTES',
  'HOURS',
  'DAYS',
]);
const UNIT_QUALIFIERS = new Set(['TimeUnit', TIME_UNIT]);
const LOGGING = new Set(['trace', 'debug', 'info', 'warn', 'error', 'log', 'print', 'println']);
const ASYNC_FACTORIES = new Set(['supplyAsync', 'runAsync']);
const STARTERS = new Set(['async', 'launch']);
const BLOCKS = new Set(['withTimeout', 'withTimeoutOrNull']);
const COROUTINE_CANCELS = new Set(['cancel', 'cancelAndJoin', 'cancelChildren']);
const FUTURE_TIMEOUTS = new Set(['orTimeout', 'completeOnTimeout']);
const COMPLETABLE_FUTURE = /(?:^|\.)CompletableFuture$/u;
const ASYNC_ADVICE =
  'Run the work as a coroutine under withTimeout, which cancels it, or submit it to an ExecutorService, wait with future.get(timeout, unit) and call cancel(true) on that Future when the TimeoutException arrives.';

function present(text: string | undefined): text is string {
  return text !== undefined && text !== '';
}

function importsBlock(file: KotlinFile, canonical: string, written: string): boolean {
  return file.imports.some(({ path, alias, all }) => {
    if (typeof alias === 'string') {
      return alias === written && path === `${COROUTINES}.${canonical}`;
    }
    return (
      written === canonical &&
      (path === `${COROUTINES}.${canonical}` || (all && path === COROUTINES))
    );
  });
}

function importedUnit(file: KotlinFile, name: string): boolean {
  return file.imports.some(({ path, alias, all }) => {
    if (all) {
      return path === TIME_UNIT && UNITS.has(name);
    }
    const constant = path.startsWith(`${TIME_UNIT}.`) ? path.slice(TIME_UNIT.length + 1) : '';
    return UNITS.has(constant) && (alias ?? constant) === name;
  });
}

function isTimeUnit(file: KotlinFile, unit: TimeoutEntry['unit']): boolean {
  if (unit === undefined) {
    return false;
  }
  return typeof unit.qualifier !== 'string'
    ? importedUnit(file, unit.name)
    : UNIT_QUALIFIERS.has(unit.qualifier) && UNITS.has(unit.name);
}

function isAsyncSource(source: TimeoutSource | undefined): source is TimeoutSource {
  return (
    source !== undefined &&
    COMPLETABLE_FUTURE.test(source.receiver ?? '') &&
    ASYNC_FACTORIES.has(source.name)
  );
}

function getMessage({ receiver }: TimeoutEntry): string {
  return `${String(receiver)}.get(timeout, unit) stops waiting for the future, not for its task: the TimeoutException handler neither cancels this future with cancel(true) nor rethrows, so the task keeps running and a retry overlaps it. Call cancel(true) on this future in the handler or a finally block (cancel(false) lets a running task finish), or rethrow the TimeoutException to the owner.`;
}

function asyncGetMessage({
  receiver,
  source,
}: {
  receiver: string | undefined;
  source: TimeoutSource;
}): string {
  return `${String(receiver)}.get(timeout, unit) stops waiting, but the task from ${String(source.receiver)}.${source.name}(...) keeps running: cancelling a CompletableFuture never interrupts its task, so cancel(true) does not stop it. ${ASYNC_ADVICE}`;
}

function futureMessage({
  kind,
  receiver,
  source,
}: {
  kind: string;
  receiver: string | undefined;
  source: TimeoutSource;
}): string {
  return `${String(receiver)}.${kind}(...) completes the future when the timeout passes, but the task from ${String(source.receiver)}.${source.name}(...) keeps running, because cancelling or completing a CompletableFuture never interrupts it. ${ASYNC_ADVICE}`;
}

function blockMessage({ name }: TimeoutEntry, awaited: AwaitedWork): string {
  return `${name} stops waiting for ${awaited.name}, which ${String(awaited.scope)}.${awaited.starter} started outside the block, so the coroutine keeps running after the timeout. Start the work inside the block, where the timeout cancels it, or cancel ${awaited.name} when the TimeoutCancellationException arrives.`;
}

function keyOf(entry: TimeoutEntry, kind: string, name: string): string {
  return `${[entry.owner, entry.function].filter(present).join('.')}:${kind}:${name}`;
}

function stopsFuture(entry: TimeoutEntry, stop: TimeoutStop): boolean {
  const { variable } = entry;
  const unknownOrigin = !entry.visible;
  switch (stop.name) {
    case 'cancel':
      return present(variable) && stop.receiver === variable && stop.argument !== 'false';
    case 'shutdownNow':
      return present(stop.receiver) && (unknownOrigin || entry.executors.includes(stop.receiver));
    case 'interrupt':
      return (
        present(stop.receiver) &&
        (entry.threads.includes(stop.receiver) || (unknownOrigin && present(variable)))
      );
    default:
      return false;
  }
}

function isStopped(entry: TimeoutEntry, asyncTask: boolean): boolean {
  return asyncTask
    ? entry.stops.some(
        (stop) =>
          stop.name === 'shutdownNow' &&
          present(stop.receiver) &&
          stop.receiver === entry.source?.executor,
      )
    : entry.stops.some((stop) => stopsFuture(entry, stop));
}

function isOwned({ throws, passes }: TimeoutHandler): boolean {
  return throws || passes.some((name) => !LOGGING.has(name));
}

function getFinding(file: KotlinFile, entry: TimeoutEntry): TimeoutProblem[] {
  const { source } = entry;
  const asyncTask = isAsyncSource(source);
  if (
    !isTimeUnit(file, entry.unit) ||
    isStopped(entry, asyncTask) ||
    entry.handlers.every(isOwned)
  ) {
    return [];
  }
  const message = asyncTask
    ? asyncGetMessage({ receiver: entry.receiver, source })
    : getMessage(entry);
  return [{ message, key: keyOf(entry, 'get', entry.name) }];
}

function futureFinding(entry: TimeoutEntry): TimeoutProblem[] {
  const { source } = entry;
  return isAsyncSource(source)
    ? [
        {
          message: futureMessage({ kind: entry.kind, receiver: entry.receiver, source }),
          key: keyOf(entry, entry.kind, entry.name),
        },
      ]
    : [];
}

function blockFindings(file: KotlinFile, entry: TimeoutEntry): TimeoutProblem[] {
  if (!importsBlock(file, entry.kind, entry.name)) {
    return [];
  }
  const cancelled = new Set(
    entry.stops.filter(({ name }) => COROUTINE_CANCELS.has(name)).map(({ root }) => root),
  );
  return entry.awaited
    .filter(
      ({ name, scope, starter }) =>
        scope !== undefined &&
        STARTERS.has(starter) &&
        !cancelled.has(name) &&
        !cancelled.has(scope),
    )
    .map((awaited) => ({
      message: blockMessage(entry, awaited),
      key: keyOf(entry, entry.kind, awaited.name),
    }));
}

function problemsOf(file: KotlinFile, entry: TimeoutEntry): TimeoutProblem[] {
  if (entry.kind === 'get') {
    return getFinding(file, entry);
  }
  if (FUTURE_TIMEOUTS.has(entry.kind)) {
    return futureFinding(entry);
  }
  return BLOCKS.has(entry.kind) ? blockFindings(file, entry) : [];
}

export function timeoutFindings(files: KotlinFile[], { finding }: RuleOptions): ReviewFinding[] {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) =>
      (file.timeouts ?? []).flatMap((entry) =>
        problemsOf(file, entry).map(({ message, key }) =>
          finding({
            rule: TIMEOUT_RULE,
            file: file.file,
            line: entry.line,
            symbol: key,
            message,
          }),
        ),
      ),
    );
}
