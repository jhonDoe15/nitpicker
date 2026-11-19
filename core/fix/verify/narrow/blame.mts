import { locate } from '../../dry-run/journal.mts';
import type { Journal, JournalEvent, LeftOutFix } from '../../dry-run/journal-types.mts';
import { addedFindings, findingKeyOf, ownersOf, unfixedFindings } from '../judge-findings.mts';
import type { CountedFinding, FindingLines, Judgement, RecipeRun } from '../verify-types.mts';
import { changedBlocks, overlaps, withoutLayout, type Block } from './line-map.mts';

const SLACK = 1;

export type Blame = Judgement & {
  readonly journal: Journal;
  readonly lines: FindingLines;
  readonly reasons: ReadonlyMap<string, readonly string[]>;
};

type Located = JournalEvent & {
  readonly recipe: string;
  readonly finding: NonNullable<JournalEvent['finding']>;
  readonly lines: NonNullable<JournalEvent['lines']>;
};

function isLocated(event: JournalEvent): event is Located {
  return event.finding !== undefined && event.lines !== undefined && event.files.length === 1;
}

function textOf(state: unknown): string | undefined {
  return typeof state === 'object' &&
    state !== null &&
    'bytes' in state &&
    Buffer.isBuffer(state.bytes)
    ? state.bytes.toString('utf8')
    : undefined;
}

function blocksOf(journal: Journal, name: string): readonly Block[] | undefined {
  const { file } = locate(journal.projectRoot, name);
  const original = file === undefined ? undefined : textOf(journal.originals.get(file));
  const fixed = file === undefined ? undefined : textOf(journal.fixed.get(file));
  return original === undefined || fixed === undefined
    ? undefined
    : changedBlocks(original, fixed, withoutLayout);
}

function unfixedBy(run: RecipeRun, events: readonly Located[], blame: Blame): Located[] {
  const keys = new Set(unfixedFindings(run, blame).map(findingKeyOf));
  return events.filter(
    ({ recipe, finding, alsoFindings = [] }) =>
      recipe === run.id &&
      [finding, ...alsoFindings].some((fixed) => keys.has(findingKeyOf(fixed))),
  );
}

function addedBy(
  added: CountedFinding,
  events: readonly Located[],
  blame: Blame,
): Located[] | undefined {
  const blocks = blocksOf(blame.journal, added.path) ?? [];
  const hits = (blame.lines.get(findingKeyOf(added)) ?? []).flatMap((line) =>
    blocks.filter(({ after }) => overlaps(after, [line, line], SLACK)),
  );
  const owners = hits.map(({ before }) =>
    events.filter(({ lines }) => lines.some((range) => overlaps(range, before, SLACK))),
  );
  return hits.length < added.count || owners.some((found) => found.length === 0)
    ? undefined
    : owners.flat();
}

function blamedIn(name: string, rolled: readonly RecipeRun[], blame: Blame): Located[] {
  const runs = rolled.filter((run) => run.files.has(name));
  const events = blame.journal.events.filter(
    ({ recipe, files }) => recipe !== undefined && files.includes(name),
  );
  if (runs.some((run) => run.files.size !== 1 || run.key === run.id) || !events.every(isLocated)) {
    return [];
  }
  const located = events.filter(isLocated);
  const added = addedFindings(blame)
    .filter((finding) => finding.path === name)
    .map((finding) => addedBy(finding, located, blame));
  const blamed = new Set([
    ...runs.flatMap((run) => unfixedBy(run, located, blame)),
    ...added.flatMap((found) => found ?? []),
  ]);
  return added.includes(undefined) || blamed.size === located.length ? [] : [...blamed];
}

function reasonOf(event: Located, rolled: readonly RecipeRun[], blame: Blame): string {
  const reasons = rolled
    .filter((run) => run.files.has(event.finding.path))
    .flatMap((run) => blame.reasons.get(run.key) ?? [])
    .filter((reason) => !reason.startsWith('shares a file'));
  return [...new Set(reasons)].join('; ');
}

export function fixesToLeaveOut(rolled: readonly RecipeRun[], blame: Blame): LeftOutFix[] {
  const stray = addedFindings(blame).some(
    (finding) =>
      !blame.runs.some((run) => run.files.has(finding.path)) &&
      ownersOf(blame.runs, finding, blame.breaking).length > 0,
  );
  if (stray) {
    return [];
  }
  const names = new Set(rolled.flatMap((run) => [...run.files]));
  return [...names].flatMap((name) =>
    blamedIn(name, rolled, blame).map((event) => ({
      ...event.finding,
      lines: event.lines,
      reason: reasonOf(event, rolled, blame),
    })),
  );
}
