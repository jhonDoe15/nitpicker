import { branchOutcomes } from './go-branch-coverage.mts';
import { comparePositions } from '../typed/go-readers.mts';
import { ingestCrapRows } from '../typed/shared-readers.mts';
import type { Branch, CoverProfile, FindingRow, GoFunction, Position } from '../go-types.mts';

const FULL = 100;

function inside(position: Position, { body, close }: Pick<GoFunction, 'body' | 'close'>) {
  return comparePositions(body, position) <= 0 && comparePositions(position, close) <= 0;
}

function ownPositions(fn: GoFunction, functions: readonly GoFunction[]) {
  const nested = functions.filter(
    (other: GoFunction) =>
      other !== fn && other.file === fn.file && inside(other.body, fn) && inside(other.close, fn),
  );
  return (position: Position) =>
    inside(position, fn) && !nested.some((literal) => inside(position, literal));
}

function share(covered: number, total: number) {
  return total === 0 ? FULL : (covered / total) * FULL;
}

type Measured = {
  functions: readonly GoFunction[];
  branches: readonly Branch[];
  profile: CoverProfile;
};

function functionCoverage(fn: GoFunction, { functions, branches, profile }: Measured) {
  const blocks = profile.files.get(fn.file) ?? [];
  const owns = ownPositions(fn, functions);
  const own = blocks.filter(({ start }) => owns(start));
  const statements = own.reduce((sum, { statements: count }) => sum + count, 0);
  const covered = own
    .filter(({ count }) => count > 0)
    .reduce((sum, { statements: count }) => sum + count, 0);
  const outcomes = branches
    .filter((branch) => branch.file === fn.file && owns(branch.at))
    .flatMap((branch) => branchOutcomes(branch, blocks, profile));
  const taken = outcomes.filter(({ count }) => count > 0).length;
  return Math.min(share(covered, statements), share(taken, outcomes.length));
}

export function goCrapFindings({
  functions,
  branches,
  profile,
  functionText,
  limit,
}: Measured & {
  functionText: (fn: { file: string; start: number; end: number }) => string;
  limit?: number | undefined;
}): FindingRow[] {
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
  return ingestCrapRows(
    rows,
    { limit, sourceText: functionText },
    (row: { name: string; fn: GoFunction }) => ({
      name: row.name,
      ...(known ? { coverage: functionCoverage(row.fn, { functions, branches, profile }) } : {}),
    }),
  ).findings;
}
