import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { EVIDENCE_CALLS } from '../../review-rules/blocking/blocking-catalog.mjs';
import { closingIndex } from '../kotlin-source.mjs';

const REACTOR_RULE = 'ReactorBlockWithoutTimeout';
const WAIT_RULE = 'UnboundedWait';
const REACTOR = EVIDENCE_CALLS.find(({ names }) => names.includes('block'));
const REACTOR_IMPORT = new RegExp(
  String.raw`^[ \t]*import\s+(?:${REACTOR.imports.map((prefix) => prefix.replaceAll('.', String.raw`\.`)).join('|')})`,
  'm',
);
const REACTOR_BLOCK = new RegExp(String.raw`\.\s*(?:${REACTOR.names.join('|')})\s*\(\s*\)`, 'g');
const FUTURE_TYPES = 'Future|CompletableFuture|FutureTask|ScheduledFuture|ForkJoinTask';
const KINDS = { future: 'future', thread: 'thread', latch: 'latch', publisher: 'publisher' };
const DECLARED = new RegExp(
  String.raw`(?<![\w$.])([A-Za-z_]\w*)\s*:\s*(?:java\.util\.concurrent\.|java\.lang\.)?(?:(${FUTURE_TYPES})|(Thread)|(CountDownLatch)|(?:reactor\.core\.publisher\.)?(Mono|Flux))(?![\w$])`,
  'dg',
);
const INITIALIZED = new RegExp(
  String.raw`(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*(?:java\.util\.concurrent\.|java\.lang\.)?(?:(CompletableFuture\s*(?:<[^>\n]*>\s*)?\(|CompletableFuture\s*\.\s*(?:supplyAsync|runAsync)\b|FutureTask\s*(?:<[^>\n]*>\s*)?\()|(Thread\s*\(|thread\s*[({]|Thread\s*\.\s*startVirtualThread\b)|(CountDownLatch\s*\()|(?:Mono|Flux)\s*\.\s*\w+)`,
  'dg',
);
const SUBMITTED =
  /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]*)?=[^\n]*?\.\s*submit\s*(?:<[^>\n]*>\s*)?[({]/dg;
const ANY_DECLARATION =
  /(?:(?<![\w$.])va[lr]\s+|[(,]\s*|\{\s*|for\s*\(\s*)([A-Za-z_]\w*)(?=\s*(?::|=(?!=)|->|,\s*\w+\s*->)|\s+in\b)/dg;
const CHAINED = new RegExp(
  String.raw`(?:CompletableFuture\s*\.\s*(?:supplyAsync|runAsync)\s*|\.\s*submit\s*(?:<[^>\n]*>\s*)?|Thread\s*\.\s*startVirtualThread\s*)([({])`,
  'g',
);
const TRAILING_WAIT = /^\s*(?:\)\s*)?\??\.\s*(?:get|join)\s*\(\s*\)/;
const BOUNDED_FUTURE = /\??\.\s*(?:orTimeout|completeOnTimeout)\s*\(/;
const CONCURRENT = /^[ \t]*import\s+java\.util\.concurrent\./m;
const WAITS = {
  [KINDS.future]: ['get', 'join'],
  [KINDS.thread]: ['join'],
  [KINDS.latch]: ['await'],
  [KINDS.publisher]: [],
};
const CONTINUATION_LINE = /^\s*\??\./;
const PUBLISHER_CHAIN =
  /\b(?:Mono|Flux)\b|bodyToMono|bodyToFlux|\.toMono\b|\.toFlux\b|\.retrieve\s*\(/;

const MESSAGES = {
  [REACTOR_RULE]:
    'Use a deadline: `mono.block(Duration.ofSeconds(30))`, and likewise `blockOptional(Duration)`, `blockFirst(Duration)` and `blockLast(Duration)`, or keep the code reactive and let the caller subscribe. This call waits for the publisher with no limit, so a publisher that never completes (a stuck connection, a lost signal) hangs this thread for good. An exception fits only code whose purpose is to wait for the publisher, such as the main function of a command.',
  [WAIT_RULE]:
    'Wait with a deadline: `future.get(30, TimeUnit.SECONDS)`, `future.orTimeout(30, TimeUnit.SECONDS).join()`, `latch.await(30, TimeUnit.SECONDS)` or `thread.join(30_000)`, and handle the timeout by cancelling the work or failing. This call waits with no limit, so a task that never finishes hangs this thread for good. An exception fits only code whose purpose is to wait for the work to finish, such as the main function of a command or a shutdown that joins a thread it just stopped.',
};

function kindOf(groups) {
  const [future, thread, latch] = groups;
  if (future !== undefined) {
    return KINDS.future;
  }
  if (thread !== undefined) {
    return KINDS.thread;
  }
  return latch === undefined ? KINDS.publisher : KINDS.latch;
}

function addKind(found, name, entry) {
  found.set(name, [...(found.get(name) ?? []), entry]);
}

function declaredKinds(code) {
  const found = new Map();
  for (const match of code.matchAll(DECLARED)) {
    addKind(found, match[1], { kind: kindOf(match.slice(2)), at: match.indices[1][0] });
  }
  for (const match of code.matchAll(INITIALIZED)) {
    addKind(found, match[1], { kind: kindOf(match.slice(2)), at: match.indices[1][0] });
  }
  if (CONCURRENT.test(code)) {
    for (const match of code.matchAll(SUBMITTED)) {
      addKind(found, match[1], { kind: KINDS.future, at: match.indices[1][0] });
    }
  }
  const declared = Map.groupBy(
    [...code.matchAll(ANY_DECLARATION)].map((match) => ({
      name: match[1],
      at: match.indices[1][0],
    })),
    ({ name }) => name,
  );
  return new Map(
    [...found].flatMap(([name, entries]) => {
      const typed = new Set(entries.map(({ at }) => at));
      const unknown = (declared.get(name) ?? []).some(({ at }) => !typed.has(at));
      return new Set(entries.map(({ kind }) => kind)).size === 1 && !unknown
        ? [[name, entries[0].kind]]
        : [];
    }),
  );
}

function waitCalls(code, name, kind) {
  const methods = WAITS[kind].map(escapeRegExp).join('|');
  const pattern = String.raw`(?<![\w$.])${escapeRegExp(name)}\s*\??\.\s*(?:${methods})\s*\(\s*\)`;
  return [...code.matchAll(new RegExp(pattern, 'g'))].map(({ index }) => index);
}

function heldWaits(code) {
  return [...declaredKinds(code)].flatMap(([name, kind]) =>
    WAITS[kind].length === 0 ? [] : waitCalls(code, name, kind),
  );
}

function chainedWaits(code) {
  return [...code.matchAll(CHAINED)].flatMap(({ index, 0: text }) => {
    const opening = index + text.length - 1;
    const end = closingIndex(code, opening);
    const rest = code.slice(end + 1);
    return TRAILING_WAIT.test(rest) && !BOUNDED_FUTURE.test(code.slice(index, end))
      ? [end + 1 + rest.search(/\S/)]
      : [];
  });
}

function chainBefore(code, offset) {
  const lines = code.slice(0, offset + 1).split('\n');
  const first = lines.findLastIndex((line, index) => index === 0 || !CONTINUATION_LINE.test(line));
  return lines.slice(first).join('\n');
}

function isPublisher(code, offset, publishers) {
  const chain = chainBefore(code, offset);
  const expression = chain.split(/(?<![=!<>])=(?!=)|\breturn\b/).at(-1);
  const root = /^\s*([A-Za-z_]\w*)/.exec(expression)?.[1];
  return (root !== undefined && publishers.has(root)) || PUBLISHER_CHAIN.test(expression);
}

export function reactorBlocksWithoutTimeout(scanned) {
  const { code } = scanned;
  if (!REACTOR_IMPORT.test(code)) {
    return [];
  }
  const publishers = new Set(
    [...declaredKinds(code)].flatMap(([name, kind]) => (kind === KINDS.publisher ? [name] : [])),
  );
  return [...code.matchAll(REACTOR_BLOCK)]
    .filter(({ index }) => isPublisher(code, index, publishers))
    .map(({ index }) => ({ rule: REACTOR_RULE, offset: index }));
}

export function unboundedWaits(scanned) {
  const { code } = scanned;
  const offsets = [...heldWaits(code), ...chainedWaits(code)];
  return [...new Set(offsets)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: WAIT_RULE, offset }));
}

export const kotlinSourceRules = {
  messages: MESSAGES,
  main: [reactorBlocksWithoutTimeout, unboundedWaits],
};
