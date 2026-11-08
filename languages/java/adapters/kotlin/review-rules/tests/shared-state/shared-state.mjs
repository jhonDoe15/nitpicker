import { classesOf, enclosingClasses } from '../discovery/declarations.mjs';
import { escaped } from '../discovery/text-scan.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import { sharedHolders } from './shared-holders.mjs';
import { hitsIn, isReset, writeSites } from './shared-writes.mjs';

export const SHARED_STATE_RULE = 'SharedTestState';
const SHARED_STATE_MESSAGE =
  'All tests of this class share this property, and this test changes it, so a test passes or fails depending on the tests that ran before it. Create the state in the test, assign it (or clear() it) in @BeforeEach or beforeTest { } so every test starts from the same value, or set isolationMode = IsolationMode.InstancePerTest (or InstancePerLeaf) on the spec. State built once in @BeforeAll or beforeSpec that the tests only read is fine.';

function scopeOf(scanned, holder) {
  if (holder.scope === 'file') {
    return { start: 0, end: scanned.code.length };
  }
  return { start: holder.klass.offset, end: holder.klass.end };
}

function hiddenByMember(scanned, holder, range) {
  if (holder.scope !== 'file') {
    return false;
  }
  const member = new RegExp(
    String.raw`(?<![\w.\x60])(?:val|var)\s+${escaped(holder.name)}(?![\w\x60])`,
    'u',
  );
  return enclosingClasses(classesOf(scanned), range.start).some((klass) =>
    member.test(scanned.code.slice(klass.start, klass.end)),
  );
}

function holderReports(scanned, holder, suites) {
  const scope = scopeOf(scanned, holder);
  const tests = testBodies(scanned, suites).filter(
    (test) => scope.start <= test.body.start && test.body.start < scope.end,
  );
  if (tests.length === 0) {
    return [];
  }
  const sites = writeSites(scanned, scope, tests);
  if (sites.resets.some((range) => hitsIn(scanned, holder, range).some(isReset))) {
    return [];
  }
  const ranges = sites.writes.filter((range) => !hiddenByMember(scanned, holder, range));
  return ranges.flatMap((range) =>
    hitsIn(scanned, holder, range).map((hit) => ({
      rule: SHARED_STATE_RULE,
      offset: hit.offset,
      symbol: range.symbol,
      key: `${range.symbol}:${holder.name}`,
      message: SHARED_STATE_MESSAGE,
    })),
  );
}

export function sharedStateReports(scanned, suites, project) {
  const seen = new Set();
  return sharedHolders(scanned, project)
    .flatMap((holder) => holderReports(scanned, holder, suites))
    .filter(({ offset }) => !seen.has(offset) && seen.add(offset));
}
