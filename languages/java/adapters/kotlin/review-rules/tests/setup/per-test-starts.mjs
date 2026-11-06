import { chainName, classesOf, headerBefore } from '../discovery/declarations.mjs';
import { functionsOf } from '../discovery/functions.mjs';
import { statementStart } from '../discovery/hosts.mjs';
import { importsOf } from '../discovery/imports.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import { closeOf, escaped } from '../discovery/text-scan.mjs';
import { memberClass, ownerOf, perTestInstances, resolveReceiver } from './receivers.mjs';
import { startSites } from './start-sites.mjs';
import { declarationsOf, expressionEnd, imports } from './start-kinds.mjs';

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
const ASSIGNED = String.raw`\s*=(?!=)`;
const STOPPED = String.raw`\s*(?:!!)?\s*\??\.\s*(?:stop|close|shutdown)\s*\(`;
const CONTAINER = 'org.testcontainers.junit.jupiter.Container';
const RULE = 'org.junit.Rule';
const REGISTER_EXTENSION = 'org.junit.jupiter.api.extension.RegisterExtension';
const KOTEST_CONTAINERS = 'io.kotest.extensions.testcontainers';

function usesKotest(scanned) {
  const { explicit, stars } = importsOf(scanned);
  return [...explicit.values(), ...stars].some((name) => name.startsWith('io.kotest'));
}

function functionRanges(scanned, annotations, overrides) {
  return functionsOf(scanned)
    .filter(
      (fn) =>
        fn.annotations.some(({ name }) => annotations.has(name)) ||
        (fn.modifiers.has('override') && overrides.has(fn.name)),
    )
    .map((fn) => ({ start: fn.body.start, end: fn.body.end }));
}

function lambdaRanges(scanned, pattern) {
  if (!usesKotest(scanned)) {
    return [];
  }
  return [...scanned.code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { start: open + 1, end: closeOf(scanned, open) };
  });
}

function inside(ranges, offset) {
  return ranges.some(({ start, end }) => start <= offset && offset < end);
}

function calledHelpers(scanned, hooks) {
  return functionsOf(scanned).filter((fn) => {
    const call = new RegExp(
      String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escaped(fn.name)}\s*\(`,
      'gu',
    );
    return hooks.some(
      (hook) =>
        !inside([hook], fn.offset) &&
        ownerOf(scanned, hook.start) === ownerOf(scanned, fn.offset) &&
        [...scanned.code.slice(hook.start, hook.end).matchAll(call)].length > 0,
    );
  });
}

function lifecycle(scanned) {
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

function mentions(scanned, { ranges, name, tail }) {
  const pattern = new RegExp(
    String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escaped(name)}${tail}`,
    'u',
  );
  return ranges.some(({ start, end }) => pattern.test(scanned.code.slice(start, end)));
}

function sameOwner(scanned, ranges, offset) {
  const owner = ownerOf(scanned, offset);
  return ranges.filter(({ start }) => ownerOf(scanned, start) === owner);
}

function isFresh({ scanned, phases }, site, range) {
  if (site.receiver === undefined) {
    return true;
  }
  const resolved = resolveReceiver(scanned, site, range);
  const kind = resolved?.declaration.kind;
  if (kind === undefined) {
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

function withoutComments(scanned, start, end) {
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

function statementKey(scanned, offset, range) {
  const start = Math.max(statementStart(scanned.code, offset), range.start);
  const end = Math.min(expressionEnd(scanned, start), range.end);
  return withoutComments(scanned, start, end);
}

function siteKey(scanned, site, range) {
  const resolved = site.receiver === undefined ? undefined : resolveReceiver(scanned, site, range);
  const declared = resolved?.local
    ? `${statementKey(scanned, resolved.declaration.offset, range)} `
    : '';
  return `${declared}${statementKey(scanned, site.offset, range)}`;
}

function report(scanned, offset, detail) {
  const symbol = chainName(classesOf(scanned), offset);
  return { offset, symbol, key: `${symbol}:${detail}` };
}

function hookStarts(context, sites) {
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

function repeatedStarts(context, suites, sites) {
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
    .filter(({ key }) => new Set(tests.get(key).map(({ test }) => test.symbol)).size > 1)
    .map(({ site, test }) => ({
      offset: site.offset,
      symbol: test.symbol,
      key: `${test.symbol}:start:${site.name}`,
    }));
}

function annotatedProperty(scanned, match) {
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

function propertyReports(scanned) {
  return [...scanned.code.matchAll(PROPERTY)]
    .filter((match) => annotatedProperty(scanned, match))
    .map((match) => report(scanned, match.index, `property:${match[1]}`));
}

function extensionReports(scanned) {
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

export function perTestStarts(scanned, suites) {
  const sites = startSites(scanned);
  const context = { scanned, phases: lifecycle(scanned) };
  const found = [
    ...propertyReports(scanned),
    ...extensionReports(scanned),
    ...hookStarts(context, sites),
    ...repeatedStarts(context, suites, sites),
  ];
  const seen = new Set();
  return found
    .filter(({ offset }) => !seen.has(offset) && seen.add(offset))
    .toSorted((left, right) => left.offset - right.offset);
}
