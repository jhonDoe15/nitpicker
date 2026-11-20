import { fixerError } from '../tool-steps/commands/fix-command.mts';
import { acceptFixes, checkFix, fixOrder } from './edits/check-fixes.mts';
import { createSnapshot } from './edits/snapshot.mts';
import { isTracked } from './edits/untrack.mts';
import { activeRecipes, ruleName } from './recipes.mts';
import { directWriter } from './writer.mts';
import { fieldOf, listOf, textsOf } from '../../../shared/values/readers.mts';
import { recipeFixesOf } from '../typed/recipe-fixes.mts';
import type { Snapshot } from '../typed/edit-types.mts';
import type { FixFile, FixRecipe, FixWriter, RecipeEdit } from '../typed/fix-types.mts';
import type {
  PlannedEntry,
  PlannedPass,
  Run,
  RunOutcome,
  RunState,
  ToolError,
} from '../typed/command-types.mts';

export const MAX_PASSES = 3;

function changesText(edit: RecipeEdit, snapshot: Snapshot, projectRoot: string): boolean {
  if (edit.type === 'untrack') {
    return isTracked(projectRoot, edit.path);
  }
  if (edit.type === 'replace') {
    return (snapshot.read(edit.path) ?? '').slice(edit.start, edit.end) !== edit.text;
  }
  return edit.type !== 'write' || snapshot.read(edit.path) !== edit.text;
}

function namedRule(finding: unknown): string {
  return `${String(fieldOf(finding, 'tool'))}/${String(fieldOf(finding, 'rule'))}`;
}

function selectedFixes(planned: unknown, recipe: FixRecipe, run: Run): unknown[] {
  const fixes = fieldOf(planned, 'fixes');
  if (!Array.isArray(fixes)) {
    throw new Error(`recipe ${recipe.id} returned no fixes list`);
  }
  return listOf(fixes).filter(
    (fix) =>
      run.selected.size === 0 ||
      [fieldOf(fix, 'finding') ?? {}, ...listOf(fieldOf(fix, 'alsoFixes'))].some((named) =>
        run.selected.has(namedRule(named)),
      ),
  );
}

function planRecipe(recipe: FixRecipe, snapshot: Snapshot, run: Run): PlannedPass {
  const { projectRoot, accepts, inputs = {} } = run.settings;
  const planned: unknown = recipe.plan({
    files: snapshot.files,
    read: snapshot.read,
    projectRoot,
    accepts,
    inputs,
  });
  const fixes = selectedFixes(planned, recipe, run);
  for (const fix of fixes) {
    checkFix(fix, recipe, { ...run.settings, snapshot, changed: new Set(run.state.names) });
  }
  return {
    entries: recipeFixesOf(fixes)
      .filter(({ edits }) =>
        edits.some((edit) => changesText(edit, snapshot, run.settings.projectRoot)),
      )
      .sort(fixOrder)
      .map((fix) => ({ recipe: recipe.id, safety: recipe.safety, scope: recipe.scope, fix })),
    notes: textsOf(fieldOf(planned, 'notes')),
  };
}

function planPass(run: Run, snapshot: Snapshot): PlannedPass {
  const planned: PlannedPass[] = [];
  for (const recipe of run.active.filter(({ id }) => !run.failed.has(id))) {
    try {
      planned.push(planRecipe(recipe, snapshot, run));
    } catch (error) {
      run.failed.set(recipe.id, fixerError(`fix-recipe ${recipe.id}`, error));
    }
  }
  return {
    entries: planned.flatMap((plan) => plan.entries),
    notes: planned.flatMap((plan) => plan.notes),
  };
}

function movedNames(names: readonly string[], applied: readonly PlannedEntry[]): string[] {
  const moves = new Map(
    applied.flatMap(({ fix }) =>
      fix.edits.flatMap((edit): [string, string][] =>
        edit.type === 'move' ? [[edit.from, edit.to]] : [],
      ),
    ),
  );
  return names.map((name) => moves.get(name) ?? name);
}

function textOf(
  recipe: string,
  finding: {
    readonly path: string;
    readonly line: number;
    readonly tool: string;
    readonly rule: string;
  },
): string {
  return `${finding.path}:${String(finding.line)} ${ruleName(finding)} (${recipe})`;
}

function findingText({ recipe, fix }: PlannedEntry): string {
  return textOf(recipe, fix.finding);
}

function findingTexts({ recipe, fix }: PlannedEntry): string[] {
  const texts = [fix.finding, ...(fix.alsoFixes ?? [])].map((finding) => textOf(recipe, finding));
  return [...new Set(texts)];
}

function leftNote(entry: PlannedEntry): string {
  return `--fix left ${findingText(entry)} for a later run: ${String(MAX_PASSES)} passes did not get to it`;
}

function closingNotes(state: RunState, leftovers: readonly PlannedEntry[]): string[] {
  const changed = [...state.changedMeanwhile].toSorted((left, right) => left.localeCompare(right));
  return [
    ...(changed.length === 0
      ? []
      : [`--fix left ${changed.join(', ')} as is: the file changed while --fix ran`]),
    ...leftovers.map(leftNote),
  ];
}

function runPass(run: Run): boolean {
  const { state } = run;
  const snapshot = createSnapshot(run.settings.projectRoot, state.names);
  const planned = planPass(run, snapshot);
  const { accepted } = acceptFixes(planned.entries);
  const { applied, changedMeanwhile, errors } = run.settings.writer.apply(snapshot, accepted);
  for (const name of changedMeanwhile) {
    state.changedMeanwhile.add(name);
  }
  state.applyErrors = state.applyErrors.concat(errors);
  state.fixed = state.fixed.concat(applied);
  state.names = movedNames(state.names, applied);
  state.notes = planned.notes;
  return applied.length > 0;
}

function settle(run: Run): PlannedEntry[] {
  const settled = Array.from({ length: MAX_PASSES }).some(() => !runPass(run));
  if (settled) {
    return [];
  }
  return planPass(run, createSnapshot(run.settings.projectRoot, run.state.names)).entries;
}

function applyError(messages: readonly string[]): ToolError[] {
  return messages.length === 0
    ? []
    : [fixerError('fix-apply', new Error(`--fix could not write ${messages.join('; ')}`))];
}

function staysNote(entry: PlannedEntry): string {
  return `--fix applied ${findingText(entry)} but the finding stays: ${String(entry.fix.stays)}`;
}

function appliedNote(entry: PlannedEntry): string {
  return `--fix applied ${findingText(entry)}: ${String(entry.fix.note)}`;
}

export function runRecipes({
  projectRoot,
  files,
  recipes,
  preset,
  selectedRules,
  accepts,
  writer = directWriter(projectRoot),
  inputs,
}: {
  readonly projectRoot: string;
  readonly files: readonly FixFile[];
  readonly recipes: readonly unknown[];
  readonly preset: string;
  readonly selectedRules: readonly string[] | undefined;
  readonly accepts: (name: string) => boolean;
  readonly writer?: FixWriter | undefined;
  readonly inputs: Readonly<Record<string, unknown>> | undefined;
}): RunOutcome {
  const run: Run = {
    active: activeRecipes(recipes, { preset, selectedRules }),
    settings: { projectRoot, accepts, writer, inputs },
    selected: new Set(selectedRules ?? []),
    failed: new Map(),
    state: {
      names: files.map(({ path: name }) => name),
      fixed: [],
      changedMeanwhile: new Set(),
      applyErrors: [],
      notes: [],
    },
  };
  const leftovers = run.active.length === 0 ? [] : settle(run);
  const { state } = run;
  return {
    fixedFindings: state.fixed.filter(({ fix }) => fix.stays === undefined).flatMap(findingTexts),
    files: files.map((file, index) => {
      const moved = state.names[index];
      return moved === undefined || moved === file.path ? file : { ...file, path: moved };
    }),
    toolErrors: [...run.failed.values(), ...applyError(state.applyErrors)],
    notes: [
      ...new Set(state.notes),
      ...state.fixed.filter(({ fix }) => fix.stays !== undefined).map(staysNote),
      ...state.fixed.filter(({ fix }) => fix.note !== undefined).map(appliedNote),
      ...closingNotes(state, leftovers),
    ],
  };
}
