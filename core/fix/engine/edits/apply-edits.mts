import { sourceOf } from './check-fixes.mts';
import { checkRealPath } from './real-paths.mts';
import { created, holds, removed, replaced, untracked } from './file-records.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';
import { messageOf } from '../../../../shared/values/readers.mts';
import { errorCode } from '../../typed/error-text.mts';
import type {
  EditContext,
  EditRecord,
  FixEntry,
  Prepared,
  PreparedEdit,
  ReplaceEdit,
  Snapshot,
  TextEdit,
  WholeEdit,
} from '../../typed/edit-types.mts';

type Outcome = {
  readonly name: string;
  readonly record?: EditRecord | undefined;
  readonly error?: unknown;
};
type ClosureState = { readonly failed: Set<string>; readonly dropped: Set<Prepared> };

function composed(text: string, replacements: readonly ReplaceEdit[]): string {
  let result = text;
  for (const edit of replacements.toSorted((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function isWhole(edit: TextEdit): edit is WholeEdit {
  return edit.type !== 'replace';
}

function isReplace(edit: TextEdit): edit is ReplaceEdit {
  return edit.type === 'replace';
}

function isNewEdit(edit: TextEdit): boolean {
  return edit.type === 'write' && edit.isNew === true;
}

function applyTextEdits(
  context: EditContext,
  name: string,
  edits: readonly TextEdit[],
): EditRecord | undefined {
  if (edits.length === 0) {
    return { undo: () => undefined, commit: () => undefined };
  }
  const file = checkRealPath(context.projectRoot, name);
  const expected = context.snapshot.entry(name)?.bytes;
  const [whole] = edits.filter(isWhole);
  if (whole === undefined) {
    return replaced(
      file,
      expected,
      composed(context.snapshot.read(name) ?? '', edits.filter(isReplace)),
    );
  }
  if (whole.type === 'write') {
    return whole.isNew ? created(file, whole.text) : replaced(file, expected, whole.text);
  }
  return removed({ projectRoot: context.projectRoot, file, expected }, whole);
}

function applyPath(
  context: EditContext,
  name: string,
  edits: readonly PreparedEdit[],
): EditRecord | undefined {
  const record = applyTextEdits(
    context,
    name,
    edits.filter((edit) => edit.type !== 'untrack'),
  );
  if (record === undefined || !edits.some((edit) => edit.type === 'untrack')) {
    return record;
  }
  try {
    const index = untracked(context.projectRoot, name);
    return {
      undo: () => {
        for (const { undo } of [index, record]) {
          undo();
        }
      },
      commit: record.commit,
    };
  } catch (error) {
    record.undo();
    throw error;
  }
}

function attempt(context: EditContext, name: string, edits: readonly PreparedEdit[]): Outcome {
  try {
    return { name, record: applyPath(context, name, edits) };
  } catch (error) {
    return { name, error: errorCode(error) === 'EEXIST' ? undefined : error };
  }
}

function newlyFailed(entries: readonly Prepared[], name: string, state: ClosureState): string[] {
  const touching = entries.filter(
    (item) => !state.dropped.has(item) && item.edits.some((edit) => sourceOf(edit) === name),
  );
  const names = [...new Set(touching.flatMap(({ edits }) => edits.map(sourceOf)))].filter(
    (source) => !state.failed.has(source),
  );
  for (const item of touching) {
    state.dropped.add(item);
  }
  for (const source of names) {
    state.failed.add(source);
  }
  return names;
}

function dropClosure(
  entries: readonly Prepared[],
  initial: ReadonlySet<string>,
): { dropped: Prepared[]; failed: Set<string> } {
  const state: ClosureState = { failed: new Set(initial), dropped: new Set() };
  const pending = [...state.failed];
  for (const name of pending) {
    appendAll(pending, newlyFailed(entries, name, state));
  }
  return { dropped: [...state.dropped], failed: state.failed };
}

function isTextEdit(edit: PreparedEdit): edit is TextEdit {
  return edit.type !== 'untrack';
}

function grouped(entries: readonly Prepared[]): Map<string, PreparedEdit[]> {
  return Map.groupBy(
    entries.flatMap(({ edits }) => edits),
    sourceOf,
  );
}

function prepare<Entry extends FixEntry>(
  snapshot: Snapshot,
  entries: readonly Entry[],
): Prepared<Entry>[] {
  return entries.map((entry) => ({
    entry,
    edits: entry.fix.edits.map((edit): PreparedEdit =>
      edit.type === 'write' && !snapshot.isRead(edit.path) ? { ...edit, isNew: true } : edit,
    ),
  }));
}

function sourceState(
  context: EditContext,
  name: string,
): { name: string; stale: boolean; error?: unknown } {
  try {
    const file = checkRealPath(context.projectRoot, name);
    return { name, stale: !holds(file, context.snapshot.entry(name)?.bytes) };
  } catch (error) {
    return { name, stale: false, error };
  }
}

function checkedSources(
  context: EditContext,
  prepared: readonly Prepared[],
): { stale: Set<string>; refused: { name: string; stale: boolean; error?: unknown }[] } {
  const sources = new Set(
    prepared.flatMap(({ edits }) =>
      edits
        .filter(isTextEdit)
        .filter((edit) => !isNewEdit(edit))
        .map(sourceOf),
    ),
  );
  const states = [...sources].map((name) => sourceState(context, name));
  return {
    stale: new Set(states.filter(({ stale }) => stale).map(({ name }) => name)),
    refused: states.filter(({ error }) => error !== undefined),
  };
}

function settleOutcomes(
  outcomes: readonly Outcome[],
  prepared: readonly Prepared[],
  stale: ReadonlySet<string>,
): { dropped: Prepared[]; unwritten: string[] } {
  const unwritten = outcomes.filter(({ record }) => record === undefined).map(({ name }) => name);
  const { dropped, failed } = dropClosure(prepared, new Set([...stale, ...unwritten]));
  for (const { name, record } of [...outcomes].reverse()) {
    if (record !== undefined) {
      (failed.has(name) ? record.undo : record.commit)();
    }
  }
  return { dropped, unwritten };
}

export function applyFixes<Entry extends FixEntry>(
  projectRoot: string,
  snapshot: Snapshot,
  entries: readonly Entry[],
): { applied: Entry[]; changedMeanwhile: string[]; errors: string[] } {
  const context = { projectRoot, snapshot };
  const prepared = prepare(snapshot, entries);
  const { stale, refused } = checkedSources(context, prepared);
  const blocked = new Set([...stale, ...refused.map(({ name }) => name)]);
  const current = prepared.filter(
    ({ edits }) => !edits.some((edit) => blocked.has(sourceOf(edit))),
  );
  const outcomes = [...grouped(current)].map(([name, edits]) => attempt(context, name, edits));
  const { dropped, unwritten } = settleOutcomes(outcomes, current, stale);
  const errors = [...refused, ...outcomes.filter(({ error }) => error !== undefined)];
  const failedNames = new Set(errors.map(({ name }) => name));
  const written = current.filter((item) => !dropped.includes(item)).map(({ entry }) => entry);
  return {
    applied: written,
    changedMeanwhile: [...stale, ...unwritten.filter((name) => !failedNames.has(name))].toSorted(
      (left, right) => left.localeCompare(right),
    ),
    errors: errors.map(({ name, error }) => `${name}: ${messageOf(error)}`),
  };
}
