import {
  chainName,
  classesOf,
  enclosingClasses,
  headerBefore,
} from '../discovery/declarations.mjs';
import { functionsOf } from '../discovery/functions.mjs';
import { enclosingHosts, statementStart } from '../discovery/hosts.mjs';
import { importsOf } from '../discovery/imports.mjs';
import { isSpecType } from '../discovery/kotest/kotest-specs.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import { closeOf, escaped } from '../discovery/text-scan.mjs';
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
  const classes = classesOf(scanned);
  const owner = (offset) => enclosingClasses(classes, offset).at(-1);
  return functionsOf(scanned).filter((fn) => {
    const call = new RegExp(
      String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escaped(fn.name)}\s*\(`,
      'gu',
    );
    return hooks.some(
      (hook) =>
        !inside([hook], fn.offset) &&
        owner(hook.start) === owner(fn.offset) &&
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

function memberClass(scanned, offset) {
  const klass = enclosingClasses(classesOf(scanned), offset).at(-1);
  if (klass === undefined) {
    return undefined;
  }
  return enclosingHosts(scanned, klass.bodyOpen, offset).length === 1 ? klass : undefined;
}

function perTestInstances(klass) {
  return (
    klass?.kind === 'class' &&
    !klass.supers.some(({ name }) => isSpecType(name)) &&
    !klass.annotations.some(
      ({ name, args }) => name === 'TestInstance' && args.includes('PER_CLASS'),
    )
  );
}

function mentions(scanned, ranges, name, tail) {
  const pattern = new RegExp(
    String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escaped(name)}${tail}`,
    'u',
  );
  return ranges.some(({ start, end }) => pattern.test(scanned.code.slice(start, end)));
}

function isFresh(scanned, site, range, phases) {
  if (site.receiver === undefined || site.always) {
    return true;
  }
  const declarations = declarationsOf(scanned).filter(({ name }) => name === site.receiver);
  return (
    declarations.some(({ offset }) => range.start <= offset && offset < range.end) ||
    mentions(scanned, phases.hooks, site.receiver, String.raw`\s*=(?!=)`) ||
    mentions(
      scanned,
      phases.teardowns,
      site.receiver,
      String.raw`\s*(?:!!)?\s*\??\.\s*(?:stop|close|shutdown)\s*\(`,
    ) ||
    declarations.some(({ offset }) => perTestInstances(memberClass(scanned, offset)))
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

function statementKey(scanned, offset) {
  const start = statementStart(scanned.code, offset);
  return withoutComments(scanned, start, expressionEnd(scanned, start));
}

function siteKey(scanned, site, range) {
  const local = declarationsOf(scanned).find(
    ({ name, offset }) => name === site.receiver && range.start <= offset && offset < range.end,
  );
  const declared = local === undefined ? '' : `${statementKey(scanned, local.offset)} `;
  return `${declared}${statementKey(scanned, site.offset)}`;
}

function report(scanned, offset, detail) {
  const symbol = chainName(classesOf(scanned), offset);
  return { offset, symbol, key: `${symbol}:${detail}` };
}

function hookStarts(scanned, sites, phases) {
  return sites.flatMap((site) => {
    const hook = phases.hooks.find(({ start, end }) => start <= site.offset && site.offset < end);
    return hook !== undefined && isFresh(scanned, site, hook, phases)
      ? [report(scanned, site.offset, `start:${site.name}`)]
      : [];
  });
}

function repeatedStarts(scanned, suites, sites, phases) {
  const keyed = testBodies(scanned, suites).flatMap((test) =>
    sites
      .filter(({ offset }) => test.body.start <= offset && offset < test.body.end)
      .filter((site) => isFresh(scanned, site, test.body, phases))
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
  const heavy = declarationsOf(scanned).some(({ offset }) => offset === match.index);
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
  const phases = lifecycle(scanned);
  const found = [
    ...propertyReports(scanned),
    ...extensionReports(scanned),
    ...hookStarts(scanned, sites, phases),
    ...repeatedStarts(scanned, suites, sites, phases),
  ];
  const seen = new Set();
  return found
    .filter(({ offset }) => !seen.has(offset) && seen.add(offset))
    .toSorted((left, right) => left.offset - right.offset);
}
