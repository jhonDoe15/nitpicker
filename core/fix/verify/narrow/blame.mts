import { locate } from '../../dry-run/journal.mts';
import type { Journal, JournalEvent, LeftOutFix } from '../../dry-run/journal-types.mts';
import { addedFindings, findingKeyOf, ownersOf, unfixedFindings } from '../judge-findings.mts';
import type { CountedFinding, FindingLines, Judgement, RecipeRun } from '../verify-types.mts';
import { changedBlocks, overlaps, withoutLayout, type Block } from '../../lines/line-map.mts';

const SLACK = 1;

export type Blame = Judgement & {
  readonly journal: Journal;
  readonly blocks?: Map<string, readonly Block[] | undefined>;
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

function cachedBlocks(blame: Blame, name: string): readonly Block[] | undefined {
  if (blame.blocks?.has(name) !== true) {
    blame.blocks?.set(name, blocksOf(blame.journal, name));
  }
  return blame.blocks?.get(name) ?? blocksOf(blame.journal, name);
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
  const lines = blame.lines.get(findingKeyOf(added)) ?? [];
  const blocks = cachedBlocks(blame, added.path) ?? [];
  const hits = lines.flatMap((line) => {
    const hit = blocks.find(({ after }) => overlaps(after, [line, line], SLACK));
    return hit === undefined ? [] : [hit];
  });
  const owners = hits.map(({ before }) =>
    events.filter(({ lines: edited }) => edited.some((range) => overlaps(range, before, SLACK))),
  );
  return lines.length !== added.count ||
    hits.length !== lines.length ||
    owners.some((found) => found.length === 0)
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

export function fixesToLeaveOut(rolled: readonly RecipeRun[], judged: Blame): LeftOutFix[] {
  const blame = { ...judged, blocks: new Map<string, readonly Block[] | undefined>() };
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
