import { fixerError } from '../common/fix-command.mjs';
import { acceptFixes, checkFix, fixOrder } from './edits/check-fixes.mjs';
import { createSnapshot } from './edits/snapshot.mjs';
import { isTracked } from './edits/untrack.mjs';
import { activeRecipes, ruleName } from './recipes.mjs';
import { directWriter } from './writer.mjs';

export const MAX_PASSES = 3;

function changesText(edit, snapshot, projectRoot) {
  if (edit.type === 'untrack') {
    return isTracked(projectRoot, edit.path);
  }
  if (edit.type === 'replace') {
    return snapshot.read(edit.path).slice(edit.start, edit.end) !== edit.text;
  }
  return edit.type !== 'write' || snapshot.read(edit.path) !== edit.text;
}

function selectedFixes(planned, recipe, run) {
  if (!Array.isArray(planned?.fixes)) {
    throw new Error(`recipe ${recipe.id} returned no fixes list`);
  }
  return planned.fixes.filter(
    ({ finding } = {}) => run.selected.size === 0 || run.selected.has(ruleName(finding ?? {})),
  );
}

function planRecipe(recipe, snapshot, run) {
  const { projectRoot, accepts, inputs = {} } = run.settings;
  const planned = recipe.plan({
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
    entries: fixes
      .filter(({ edits }) =>
        edits.some((edit) => changesText(edit, snapshot, run.settings.projectRoot)),
      )
      .sort(fixOrder)
      .map((fix) => ({ recipe: recipe.id, safety: recipe.safety, fix })),
    notes: planned.notes ?? [],
  };
}

function planPass(run, snapshot) {
  const planned = [];
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

function movedNames(names, applied) {
  const moves = new Map(
    applied.flatMap(({ fix }) =>
      fix.edits.filter(({ type }) => type === 'move').map(({ from, to }) => [from, to]),
    ),
  );
  return names.map((name) => moves.get(name) ?? name);
}

function textOf(recipe, finding) {
  return `${finding.path}:${finding.line} ${ruleName(finding)} (${recipe})`;
}

function findingText({ recipe, fix }) {
  return textOf(recipe, fix.finding);
}

function findingTexts({ recipe, fix }) {
  const texts = [fix.finding, ...(fix.alsoFixes ?? [])].map((finding) => textOf(recipe, finding));
  return [...new Set(texts)];
}

function leftNote(entry) {
  return `--fix left ${findingText(entry)} for a later run: ${MAX_PASSES} passes did not get to it`;
}

function closingNotes(state, leftovers) {
  const changed = [...state.changedMeanwhile].toSorted((left, right) => left.localeCompare(right));
  return [
    ...(changed.length === 0
      ? []
      : [`--fix left ${changed.join(', ')} as is: the file changed while --fix ran`]),
    ...leftovers.map(leftNote),
  ];
}

function runPass(run) {
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

function settle(run) {
  const settled = Array.from({ length: MAX_PASSES }).some(() => !runPass(run));
  if (settled) {
    return [];
  }
  return planPass(run, createSnapshot(run.settings.projectRoot, run.state.names)).entries;
}

function applyError(messages) {
  return messages.length === 0
    ? []
    : [fixerError('fix-apply', new Error(`--fix could not write ${messages.join('; ')}`))];
}

function staysNote(entry) {
  return `--fix applied ${findingText(entry)} but the finding stays: ${entry.fix.stays}`;
}

function appliedNote(entry) {
  return `--fix applied ${findingText(entry)}: ${entry.fix.note}`;
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
}) {
  const run = {
    active: activeRecipes(recipes, { preset, selectedRules }),
    settings: { projectRoot, accepts, writer, inputs },
    selected: new Set(selectedRules),
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
    files: files.map((file, index) =>
      state.names[index] === file.path ? file : { ...file, path: state.names[index] },
    ),
    toolErrors: [...run.failed.values(), ...applyError(state.applyErrors)],
    notes: [
      ...new Set(state.notes),
      ...state.fixed.filter(({ fix }) => fix.stays !== undefined).map(staysNote),
      ...state.fixed.filter(({ fix }) => fix.note !== undefined).map(appliedNote),
      ...closingNotes(state, leftovers),
    ],
  };
}
