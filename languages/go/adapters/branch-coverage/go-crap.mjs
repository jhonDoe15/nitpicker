import { ingestCrapRows } from '../../../../shared/ingest/lizard-crap.mjs';
import { branchOutcomes } from './go-branch-coverage.mjs';
import { comparePositions } from './coverage-profile.mjs';

const FULL = 100;

function inside(position, { body, close }) {
  return comparePositions(body, position) <= 0 && comparePositions(position, close) <= 0;
}

function ownBlocks(fn, functions, blocks) {
  const nested = functions.filter(
    (other) =>
      other !== fn && other.file === fn.file && inside(other.body, fn) && inside(other.close, fn),
  );
  return blocks.filter(
    ({ start }) => inside(start, fn) && !nested.some((literal) => inside(start, literal)),
  );
}

function share(covered, total) {
  return total === 0 ? FULL : (covered / total) * FULL;
}

function functionCoverage(fn, { functions, branches, profile }) {
  const blocks = profile.files.get(fn.file) ?? [];
  const own = ownBlocks(fn, functions, blocks);
  const statements = own.reduce((sum, { statements: count }) => sum + count, 0);
  const covered = own
    .filter(({ count }) => count > 0)
    .reduce((sum, { statements: count }) => sum + count, 0);
  const outcomes = branches
    .filter((branch) => branch.file === fn.file && branch.function === fn.name)
    .flatMap((branch) => branchOutcomes(branch, blocks, profile.counted));
  const taken = outcomes.filter(({ count }) => count > 0).length;
  return Math.min(share(covered, statements), share(taken, outcomes.length));
}

export function goCrapFindings({ functions, branches, profile, functionText, limit }) {
  const known = profile.files.size > 0;
  const measured = functions.filter((fn) => !known || profile.files.has(fn.file));
  const rows = measured.map((fn) => ({
    ccn: fn.complexity,
    file: fn.file,
    name: fn.name,
    longName: fn.name,
    start: fn.start,
    end: fn.end,
    numberedAmongSameSource: true,
    fn,
  }));
  return ingestCrapRows(rows, { limit, sourceText: functionText }, (row) => ({
    name: row.name,
    ...(known ? { coverage: functionCoverage(row.fn, { functions, branches, profile }) } : {}),
  })).findings;
}
