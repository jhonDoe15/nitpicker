export const TIMEOUT_RULE = 'timeout-abandons-operation';

const COROUTINES = 'kotlinx.coroutines';
const STOPPING_CALLS = new Set(['cancel', 'shutdownNow', 'shutdown', 'interrupt']);
const ASYNC_FACTORIES = new Set(['supplyAsync', 'runAsync']);
const STARTERS = new Set(['async', 'launch']);
const BLOCKS = new Set(['withTimeout', 'withTimeoutOrNull']);
const FUTURE_TIMEOUTS = new Set(['orTimeout', 'completeOnTimeout']);
const COMPLETABLE_FUTURE = /(?:^|\.)CompletableFuture$/u;
const GET_ADVICE =
  'Call cancel(true) on the future in the handler, rethrow the TimeoutException to the owner, or give the task its own deadline.';
const FUTURE_ADVICE =
  'Run the work as a coroutine under withTimeout, which cancels it, or on an ExecutorService whose Future you cancel(true) when the timeout passes, or give the task a deadline it checks.';

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

function getMessage({ receiver }) {
  return `${receiver}.get(timeout, unit) stops waiting for the future, not for its task: the TimeoutException handler neither calls cancel(true) nor rethrows, so the task keeps running and a retry overlaps it. ${GET_ADVICE}`;
}

function futureMessage({ kind, receiver, source }) {
  return `${receiver}.${kind}(...) completes the future when the timeout passes, but the task from ${source.receiver}.${source.name}(...) keeps running, because cancelling a CompletableFuture never interrupts it. ${FUTURE_ADVICE}`;
}

function blockMessage({ name }, awaited) {
  const started = `${awaited.scope}.${awaited.starter}`;
  return `${name} stops waiting for ${awaited.name}, which ${started} started outside the timeout block, so the coroutine keeps running after the timeout: ${awaited.scope} is not cancelled by it. Start the work inside the block (${name}(millis) { work() } or coroutineScope { async { work() }.await() }), or cancel ${awaited.name} when the timeout passes (catch (e: TimeoutCancellationException) { ${awaited.name}.cancel(); throw e }).`;
}

function stops(calls) {
  return calls.some((name) => STOPPING_CALLS.has(name));
}

function getFinding(entry) {
  const abandoned =
    !stops(entry.finallyCalls ?? []) &&
    entry.handlers.some(({ calls, throws }) => !throws && !stops(calls));
  return abandoned ? [{ message: getMessage(entry), key: `get:${entry.receiver}` }] : [];
}

function futureFinding(entry) {
  const { source } = entry;
  const abandoned =
    source !== undefined &&
    COMPLETABLE_FUTURE.test(source.receiver ?? '') &&
    ASYNC_FACTORIES.has(source.name);
  return abandoned
    ? [{ message: futureMessage(entry), key: `${entry.kind}:${entry.receiver}` }]
    : [];
}

function blockFindings(file, entry) {
  if (!importsBlock(file, entry.kind, entry.name)) {
    return [];
  }
  const cancelled = new Set(entry.cancelled ?? []);
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
      key: `${entry.kind}:${awaited.name}`,
    }));
}

function problemsOf(file, entry) {
  if (entry.kind === 'get') {
    return getFinding(entry);
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
