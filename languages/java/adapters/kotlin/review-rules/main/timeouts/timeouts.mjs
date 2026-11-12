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

function importsBlock(file, canonical, written) {
  return file.imports.some(({ path, alias, all }) => {
    if (alias !== undefined && alias !== null) {
      return alias === written && path === `${COROUTINES}.${canonical}`;
    }
    return (
      written === canonical &&
      (path === `${COROUTINES}.${canonical}` || (all && path === COROUTINES))
    );
  });
}

function importedUnit(file, name) {
  return file.imports.some(({ path, alias, all }) => {
    if (all) {
      return path === TIME_UNIT && UNITS.has(name);
    }
    const constant = path.startsWith(`${TIME_UNIT}.`) ? path.slice(TIME_UNIT.length + 1) : '';
    return UNITS.has(constant) && (alias ?? constant) === name;
  });
}

function isTimeUnit(file, unit) {
  if (unit === undefined || unit === null) {
    return false;
  }
  return unit.qualifier === undefined || unit.qualifier === null
    ? importedUnit(file, unit.name)
    : UNIT_QUALIFIERS.has(unit.qualifier) && UNITS.has(unit.name);
}

function isAsyncSource(source) {
  return (
    source !== undefined &&
    source !== null &&
    COMPLETABLE_FUTURE.test(source.receiver ?? '') &&
    ASYNC_FACTORIES.has(source.name)
  );
}

function getMessage({ receiver }) {
  return `${receiver}.get(timeout, unit) stops waiting for the future, not for its task: the TimeoutException handler neither cancels this future with cancel(true) nor rethrows, so the task keeps running and a retry overlaps it. Call cancel(true) on this future in the handler or a finally block (cancel(false) lets a running task finish), or rethrow the TimeoutException to the owner.`;
}

function asyncGetMessage({ receiver, source }) {
  return `${receiver}.get(timeout, unit) stops waiting, but the task from ${source.receiver}.${source.name}(...) keeps running: cancelling a CompletableFuture never interrupts its task, so cancel(true) does not stop it. ${ASYNC_ADVICE}`;
}

function futureMessage({ kind, receiver, source }) {
  return `${receiver}.${kind}(...) completes the future when the timeout passes, but the task from ${source.receiver}.${source.name}(...) keeps running, because cancelling or completing a CompletableFuture never interrupts it. ${ASYNC_ADVICE}`;
}

function blockMessage({ name }, awaited) {
  return `${name} stops waiting for ${awaited.name}, which ${awaited.scope}.${awaited.starter} started outside the block, so the coroutine keeps running after the timeout. Start the work inside the block, where the timeout cancels it, or cancel ${awaited.name} when the TimeoutCancellationException arrives.`;
}

function keyOf(entry, kind, name) {
  return `${[entry.owner, entry.function].filter(Boolean).join('.')}:${kind}:${name}`;
}

function stopsFuture(entry, stop) {
  const { variable } = entry;
  const unknownOrigin = entry.visible === false;
  switch (stop.name) {
    case 'cancel':
      return Boolean(variable) && stop.receiver === variable && stop.argument !== 'false';
    case 'shutdownNow':
      return Boolean(stop.receiver) && (unknownOrigin || entry.executors.includes(stop.receiver));
    case 'interrupt':
      return (
        Boolean(stop.receiver) &&
        (entry.threads.includes(stop.receiver) || (unknownOrigin && Boolean(variable)))
      );
    default:
      return false;
  }
}

function isStopped(entry, asyncTask) {
  return asyncTask
    ? entry.stops.some(
        (stop) =>
          stop.name === 'shutdownNow' &&
          Boolean(stop.receiver) &&
          stop.receiver === entry.source.executor,
      )
    : entry.stops.some((stop) => stopsFuture(entry, stop));
}

function isOwned({ throws, passes }) {
  return throws || passes.some((name) => !LOGGING.has(name));
}

function getFinding(file, entry) {
  const asyncTask = isAsyncSource(entry.source);
  if (
    !isTimeUnit(file, entry.unit) ||
    isStopped(entry, asyncTask) ||
    entry.handlers.every(isOwned)
  ) {
    return [];
  }
  const message = asyncTask ? asyncGetMessage(entry) : getMessage(entry);
  return [{ message, key: keyOf(entry, 'get', entry.name) }];
}

function futureFinding(entry) {
  return isAsyncSource(entry.source)
    ? [{ message: futureMessage(entry), key: keyOf(entry, entry.kind, entry.name) }]
    : [];
}

function blockFindings(file, entry) {
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

function problemsOf(file, entry) {
  if (entry.kind === 'get') {
    return getFinding(file, entry);
  }
  if (FUTURE_TIMEOUTS.has(entry.kind)) {
    return futureFinding(entry);
  }
  return BLOCKS.has(entry.kind) ? blockFindings(file, entry) : [];
}

export function timeoutFindings(files, { finding }) {
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
