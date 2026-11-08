import { closingIndex, enclosingOpen } from '../kotlin-source.mjs';

const RULE = 'FutureWithoutException';
const BUILDERS =
  /(?<![\w$])(?:suspendCancellableCoroutine|suspendCoroutine)\s*(?:<[^<>{}\n]*>)?\s*\{/g;
const BUILDER_RESUME = /\.\s*resume\s*\(|::\s*resume(?![\w$])/g;
const BUILDER_FAILS =
  /\.\s*(?:resumeWithException|resumeWith|cancel)\s*\(|::\s*(?:resumeWithException|resumeWith|cancel)(?![\w$])/;
const CREATED =
  /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*(?:CompletableDeferred|CompletableFuture)\s*(?:<[^<>\n]*(?:<[^<>\n]*>[^<>\n]*)*>)?\s*\(\s*\)/g;
const FAILING_CALLS = 'completeExceptionally|cancel|obtrudeException|orTimeout|completeOnTimeout';
const FAILING_REFERENCES = 'completeExceptionally|cancel|obtrudeException';

const MESSAGES = {
  [RULE]:
    'Resume or complete it on the failure path too: call `continuation.resumeWithException(error)` or `deferred.completeExceptionally(error)` from the error callback, or use an API that throws by itself, such as a suspending client call or `future.await()` from kotlinx-coroutines. This continuation or future is resumed only with a value from a callback, so when the work behind the callback fails it never resumes and the caller waits forever.',
};

function blockOf(code, open) {
  return { open, end: closingIndex(code, open) };
}

function inCallback(code, block, offset, text) {
  return text.includes('::') || enclosingOpen(code, offset) !== block.open;
}

function resumesOnlyWithValue(code, block) {
  const body = code.slice(block.open, block.end);
  if (BUILDER_FAILS.test(body)) {
    return false;
  }
  return [...body.matchAll(BUILDER_RESUME)].some(({ index, 0: text }) =>
    inCallback(code, block, block.open + index, text),
  );
}

function builders(code) {
  return [...code.matchAll(BUILDERS)]
    .filter(({ index, 0: text }) =>
      resumesOnlyWithValue(code, blockOf(code, index + text.length - 1)),
    )
    .map(({ index }) => index);
}

function usePatterns(name) {
  return {
    completes: new RegExp(
      String.raw`(?<![\w$])${name}\s*(?:\??\.\s*complete\s*\(|::\s*complete(?![\w$]))`,
      'g',
    ),
    fails: new RegExp(
      String.raw`(?<![\w$])${name}\s*(?:\??\.\s*(?:${FAILING_CALLS})\s*\(|::\s*(?:${FAILING_REFERENCES})(?![\w$]))`,
    ),
    handed: new RegExp(
      String.raw`[(,\[]\s*${name}\s*[,)\]]|(?<![=!<>])=\s*${name}(?![\w$])\s*(?![.?:(])|(?<![\w$])to\s+${name}(?![\w$])`,
    ),
  };
}

function completedOnlyWithValue(code, match) {
  const open = enclosingOpen(code, match.index);
  if (open === -1) {
    return false;
  }
  const block = blockOf(code, open);
  const rest = code.slice(match.index + match[0].length, block.end);
  const patterns = usePatterns(match[1]);
  if (patterns.fails.test(rest) || patterns.handed.test(rest)) {
    return false;
  }
  const offset = match.index + match[0].length;
  return [...rest.matchAll(patterns.completes)].some(({ index, 0: text }) =>
    inCallback(code, block, offset + index, text),
  );
}

export function futuresWithoutException(scanned) {
  const { code } = scanned;
  const created = [...code.matchAll(CREATED)]
    .filter((match) => completedOnlyWithValue(code, match))
    .map(({ index }) => index);
  return [...builders(code), ...created]
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: RULE, offset }));
}

export const kotlinSourceRules = { messages: MESSAGES, main: [futuresWithoutException] };
