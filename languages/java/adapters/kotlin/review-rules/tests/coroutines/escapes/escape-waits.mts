import type { ClassInfo, TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';

type SuiteLike = { klass: ClassInfo; ancestors: ClassInfo[] };
import { classesOf } from '../../discovery/declarations.mts';
import { functionOwners, functionsOf } from '../../discovery/functions.mts';
import { closeOf, escapeRegExp } from '../../discovery/text-scan.mts';

const TEARDOWN_ANNOTATIONS = new Set(['After', 'AfterEach', 'AfterTest', 'AfterAll', 'AfterClass']);
const TEARDOWN_CALL =
  /(?<![\w.`])(?:afterTest|afterEach|afterSpec|afterContainer|afterAny|finalizeSpec)\s*(?=\{)/gu;
const SYNC_TYPES = [
  'CountDownLatch|CompletableFuture|CompletableDeferred|Phaser|CyclicBarrier|Semaphore|Exchanger',
  'Channel|SynchronousQueue|ArrayBlockingQueue|LinkedBlockingQueue',
].join('|');
const SYNC_TYPE = new RegExp(String.raw`\b(?:${SYNC_TYPES})\b`, 'u');
const DECLARATION = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.<>?]+))?\s*(?:=\s*([^\n]*))?/gu;
const SYNC_MEMBERS = [
  'await|get|acquire|tryAcquire|join|awaitAdvance|arriveAndAwaitAdvance',
  'getCompleted|receive|receiveCatching|take|poll|exchange',
].join('|');
const AWAITILITY_STEPS = 'atMost|until|untilAsserted|pollInterval|withPollInterval';
const WAIT_LIBRARIES = new RegExp(
  String.raw`\bawait\s*\(\s*\)\s*\.|\bawait\s+(?:${AWAITILITY_STEPS})\b|\bAwaitility\b|\b(?:eventually|untilAsserted|untilCallTo)\b`,
  'u',
);
const TEARDOWN_MEMBERS = 'cancel|cancelChildren|cancelAndJoin|join|close';

function teardownClasses(scanned: TestScanned, suite: SuiteLike): ClassInfo[] {
  const chain = [suite.klass, ...suite.ancestors];
  const supers = new Set(chain.flatMap((klass) => klass.supers.map(({ name }) => name)));
  return [...chain, ...classesOf(scanned).filter((klass) => supers.has(klass.name))];
}

export function teardownFor(scanned: TestScanned, suite: SuiteLike): string {
  const { code } = scanned;
  const classes = new Set(teardownClasses(scanned, suite));
  const owners = functionOwners(scanned);
  const annotated = functionsOf(scanned)
    .filter((fn) => {
      const owner = owners.get(fn.offset);
      return owner !== undefined && classes.has(owner);
    })
    .filter((fn) => fn.annotations.some(({ name }) => TEARDOWN_ANNOTATIONS.has(name)))
    .map((fn) => code.slice(fn.body.start, fn.body.end));
  const lambdas = [...classes].flatMap((klass) =>
    [...code.slice(klass.start, klass.end).matchAll(TEARDOWN_CALL)].map((match) => {
      const open = klass.start + match.index + match[0].length;
      return code.slice(open, closeOf(scanned, open));
    }),
  );
  return [...annotated, ...lambdas].join('\n');
}

export function isTornDown(teardown: string, name: string): boolean {
  const word = escapeRegExp(name);
  const context = String.raw`(?:coroutineContext\s*(?:\.\s*job|\[\s*Job\s*\])?\s*\??\.\s*)?`;
  const member = String.raw`\b${word}\s*\??\.\s*${context}(?:${TEARDOWN_MEMBERS})\w*\s*\(`;
  const argument = String.raw`\b(?:cancel|close)\w*\s*\(\s*${word}\b`;
  return new RegExp(`${member}|${argument}`, 'u').test(teardown);
}

export function syncNames(code: string): Set<string> {
  return new Set(
    [...code.matchAll(DECLARATION)]
      .filter((match) => SYNC_TYPE.test(`${match[2] ?? ''} ${match[3] ?? ''}`))
      .map((match) => groupOf(match, 1)),
  );
}

export function waitsAfter(text: string, syncs: Set<string>): boolean {
  const names = [...syncs].map(escapeRegExp);
  const synced =
    names.length > 0 &&
    new RegExp(String.raw`\b(?:${names.join('|')})\s*\??\.\s*(?:${SYNC_MEMBERS})\b`, 'u').test(
      text,
    );
  return synced || WAIT_LIBRARIES.test(text);
}
