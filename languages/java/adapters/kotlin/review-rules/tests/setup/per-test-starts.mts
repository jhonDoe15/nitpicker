import type { StartReport, StartSite } from '../typed/rule-types.mts';
import type { FunctionInfo, Span, Suite, TestScanned } from '../typed/discovery-types.mts';
import { groupOf } from '../typed/indexing.mts';

type Phases = { hooks: Span[]; teardowns: Span[] };
type StartContext = { scanned: TestScanned; phases: Phases };
import { chainName, classesOf, headerBefore } from '../discovery/declarations.mts';
import { functionsOf } from '../discovery/functions.mts';
import { statementStart } from '../discovery/hosts.mts';
import { importsOf } from '../discovery/imports.mts';
import { testBodies } from '../discovery/test-units.mts';
import { closeOf, escapeRegExp } from '../discovery/text-scan.mts';
import { inRanges } from '../isolation/report.mts';
import { memberClass, ownerOf, perTestInstances, resolveReceiver } from './receivers.mts';
import { startSites } from './start-sites.mts';
import { declarationsOf, expressionEnd, imports } from './start-kinds.mts';

export const PER_TEST_START_RULE = 'ServerOrContainerPerTest';
export const PER_TEST_START_MESSAGE =
  'Do not start a container, server or process for each test: a @Container, @Rule or @RegisterExtension property outside a companion object, a Kotest container extension in a per-test mode, a start in @BeforeEach, @Before, beforeTest or beforeEach (or a function of the class it calls) on an object made for each test, or the same start in two or more tests of a class. Start it once (in a companion object, @BeforeAll, or a Kotest spec or project extension) and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh instance.';

const HOOK_ANNOTATIONS = new Set(['BeforeEach', 'Before', 'BeforeMethod']);
const TEARDOWN_ANNOTATIONS = new Set(['AfterEach', 'After', 'AfterMethod']);
const HOOK_NAMES = new Set(['beforeTest', 'beforeEach', 'beforeAny']);
const TEARDOWN_NAMES = new Set(['afterTest', 'afterEach', 'afterAny']);
const HOOK_LAMBDA = /(?<![\w.`])(?:beforeTest|beforeEach|beforeAny)\s*\{/gu;
const TEARDOWN_LAMBDA = /(?<![\w.`])(?:afterTest|afterEach|afterAny)\s*\{/gu;
const PROPERTY = /(?<![\w.`])(?:val|var)\s+([A-Za-z_]\w*)/gu;
const PER_TEST_MODE =
  /(?<![\w`])(?:ContainerLifecycleMode\s*\.\s*Test|LifecycleMode\s*\.\s*EveryTest)\b/gu;
const PER_TEST_LISTENER = /\.\s*perTest\s*\(\s*\)/gu;
const ASSIGNED = /\s*=(?!=)/u;
const STOPPED = /\s*(?:!!\s*)?\??\.\s*(?:stop|close|shutdown)\s*\(/u;
const CONTAINER = 'org.testcontainers.junit.jupiter.Container';
const RULE = 'org.junit.Rule';
const REGISTER_EXTENSION = 'org.junit.jupiter.api.extension.RegisterExtension';
const KOTEST_CONTAINERS = 'io.kotest.extensions.testcontainers';

function usesKotest(scanned: TestScanned): boolean {
  const { explicit, stars } = importsOf(scanned);
  return [...explicit.values(), ...stars].some((name) => name.startsWith('io.kotest'));
}

function functionRanges(
  scanned: TestScanned,
  annotations: Set<string>,
  overrides: Set<string>,
): Span[] {
  return functionsOf(scanned)
    .filter(
      (fn) =>
        fn.annotations.some(({ name }) => annotations.has(name)) ||
        (fn.modifiers.has('override') && overrides.has(fn.name)),
    )
    .map((fn) => ({ start: fn.body.start, end: fn.body.end }));
}

function lambdaRanges(scanned: TestScanned, pattern: RegExp): Span[] {
  if (!usesKotest(scanned)) {
    return [];
  }
  return [...scanned.code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { start: open + 1, end: closeOf(scanned, open) };
  });
}

function calledHelpers(scanned: TestScanned, hooks: Span[]): FunctionInfo[] {
  return functionsOf(scanned).filter((fn) => {
    const call = new RegExp(
      String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escapeRegExp(fn.name)}\s*\(`,
      'gu',
    );
    return hooks.some(
      (hook) =>
        !inRanges([hook], fn.offset) &&
        ownerOf(scanned, hook.start) === ownerOf(scanned, fn.offset) &&
        [...scanned.code.slice(hook.start, hook.end).matchAll(call)].length > 0,
    );
  });
}

function lifecycle(scanned: TestScanned): Phases {
  const direct = [
    ...functionRanges(scanned, HOOK_ANNOTATIONS, HOOK_NAMES),
    ...lambdaRanges(scanned, HOOK_LAMBDA),
  ];
  const helpers = calledHelpers(scanned, direct).map((fn) => ({
    start: fn.body.start,
    end: fn.body.end,
  }));
  return {
    hooks: [...direct, ...helpers],
    teardowns: [
      ...functionRanges(scanned, TEARDOWN_ANNOTATIONS, TEARDOWN_NAMES),
      ...lambdaRanges(scanned, TEARDOWN_LAMBDA),
    ],
  };
}

function mentions(
  scanned: TestScanned,
  { ranges, name, tail }: { ranges: Span[]; name: string; tail: RegExp },
): boolean {
  const pattern = new RegExp(
    String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escapeRegExp(name)}${tail.source}`,
    'u',
  );
  return ranges.some(({ start, end }) => pattern.test(scanned.code.slice(start, end)));
}

function sameOwner(scanned: TestScanned, ranges: Span[], offset: number): Span[] {
  const owner = ownerOf(scanned, offset);
  return ranges.filter(({ start }) => ownerOf(scanned, start) === owner);
}

function isFresh({ scanned, phases }: StartContext, site: StartSite, range: Span): boolean {
  if (site.receiver === undefined) {
    return true;
  }
  const resolved = resolveReceiver(scanned, site, range);
  const kind = resolved?.declaration.kind;
  if (resolved === undefined || kind === undefined) {
    return false;
  }
  const hooks = sameOwner(scanned, phases.hooks, site.offset);
  const teardowns = sameOwner(scanned, phases.teardowns, site.offset);
  return (
    kind === 'always' ||
    resolved.local ||
    mentions(scanned, { ranges: hooks, name: site.receiver, tail: ASSIGNED }) ||
    mentions(scanned, { ranges: teardowns, name: site.receiver, tail: STOPPED }) ||
    perTestInstances(memberClass(scanned, resolved.declaration.offset))
  );
}

function withoutComments(scanned: TestScanned, start: number, end: number): string {
  const kept = scanned.comments
    .filter((comment) => comment.end > start && comment.start < end)
    .reduceRight(
      (text, comment) =>
        text.slice(0, Math.max(0, comment.start - start)) +
        text.slice(Math.min(end, comment.end) - start),
      scanned.source.slice(start, end),
    );
  return kept.replaceAll(/\s+/gu, ' ').trim();
}

function statementKey(scanned: TestScanned, offset: number, range: Span): string {
  const start = Math.max(statementStart(scanned.code, offset), range.start);
  const end = Math.min(expressionEnd(scanned, start), range.end);
  return withoutComments(scanned, start, end);
}

function siteKey(scanned: TestScanned, site: StartSite, range: Span): string {
  const resolved = site.receiver === undefined ? undefined : resolveReceiver(scanned, site, range);
  const declared = resolved?.local
    ? `${statementKey(scanned, resolved.declaration.offset, range)} `
    : '';
  return `${declared}${statementKey(scanned, site.offset, range)}`;
}

function report(scanned: TestScanned, offset: number, detail: string): StartReport {
  const symbol = chainName(classesOf(scanned), offset);
  return { offset, symbol, key: `${symbol}:${detail}` };
}

function hookStarts(context: StartContext, sites: StartSite[]): StartReport[] {
  const { scanned, phases } = context;
  return sites.flatMap((site) => {
    const hook = phases.hooks.find(({ start, end }) => start <= site.offset && site.offset < end);
    const inProperty =
      site.receiver === undefined && perTestInstances(memberClass(scanned, site.offset));
    return inProperty || (hook !== undefined && isFresh(context, site, hook))
      ? [report(scanned, site.offset, `start:${site.name}`)]
      : [];
  });
}

function repeatedStarts(context: StartContext, suites: Suite[], sites: StartSite[]): StartReport[] {
  const { scanned } = context;
  const keyed = testBodies(scanned, suites).flatMap((test) =>
    sites
      .filter(({ offset }) => test.body.start <= offset && offset < test.body.end)
      .filter((site) => isFresh(context, site, test.body))
      .map((site) => ({
        site,
        test,
        key: `${test.suite.symbol}|${siteKey(scanned, site, test.body)}`,
      })),
  );
  const tests = Map.groupBy(keyed, ({ key }) => key);
  return keyed
    .filter(({ key }) => new Set((tests.get(key) ?? []).map(({ test }) => test.symbol)).size > 1)
    .map(({ site, test }) => ({
      offset: site.offset,
      symbol: test.symbol,
      key: `${test.symbol}:start:${site.name}`,
    }));
}

function annotatedProperty(scanned: TestScanned, match: RegExpExecArray): boolean {
  const names = new Set(headerBefore(scanned, match.index).annotations.map(({ name }) => name));
  const klass = memberClass(scanned, match.index);
  const heavy = declarationsOf(scanned).some(
    ({ offset, kind }) => offset === match.index && kind !== undefined,
  );
  const initializer = scanned.code.slice(match.index, expressionEnd(scanned, match.index));
  return (
    (names.has('Container') && imports(scanned, CONTAINER) && perTestInstances(klass)) ||
    (names.has('Rule') && imports(scanned, RULE) && klass?.kind === 'class' && heavy) ||
    (names.has('RegisterExtension') &&
      imports(scanned, REGISTER_EXTENSION) &&
      perTestInstances(klass) &&
      /\bWireMockExtension\b/u.test(initializer))
  );
}

function propertyReports(scanned: TestScanned): StartReport[] {
  return [...scanned.code.matchAll(PROPERTY)]
    .filter((match) => annotatedProperty(scanned, match))
    .map((match) => report(scanned, match.index, `property:${groupOf(match, 1)}`));
}

function extensionReports(scanned: TestScanned): StartReport[] {
  const { explicit, stars } = importsOf(scanned);
  const kotest = [...explicit.values(), ...stars].some((name) =>
    name.startsWith(KOTEST_CONTAINERS),
  );
  if (!kotest) {
    return [];
  }
  return [...scanned.code.matchAll(PER_TEST_MODE), ...scanned.code.matchAll(PER_TEST_LISTENER)].map(
    (match) => report(scanned, match.index, 'extension'),
  );
}

export function perTestStarts(scanned: TestScanned, suites: Suite[]): StartReport[] {
  const sites = startSites(scanned);
  const context = { scanned, phases: lifecycle(scanned) };
  const found = [
    ...propertyReports(scanned),
    ...extensionReports(scanned),
    ...hookStarts(context, sites),
    ...repeatedStarts(context, suites, sites),
  ];
  const seen = new Set<number>();
  return found
    .filter(({ offset }) => {
      if (seen.has(offset)) {
        return false;
      }
      seen.add(offset);
      return true;
    })
    .toSorted((left, right) => left.offset - right.offset);
}
