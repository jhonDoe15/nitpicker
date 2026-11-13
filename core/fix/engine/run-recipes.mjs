import { fixerError } from '../common/fix-command.mjs';
import { acceptFixes, checkFix, fixOrder } from './edits/check-fixes.mjs';
import { createSnapshot } from './edits/snapshot.mjs';
import { activeRecipes, ruleName } from './recipes.mjs';
import { directWriter } from './writer.mjs';

export const MAX_PASSES = 3;

function changesText(edit, snapshot) {
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
  const planned = recipe.plan({
    files: snapshot.files,
    read: snapshot.read,
    projectRoot: run.settings.projectRoot,
    accepts: run.settings.accepts,
  });
  const fixes = selectedFixes(planned, recipe, run);
  for (const fix of fixes) {
    checkFix(fix, recipe, { ...run.settings, snapshot, changed: new Set(run.state.names) });
  }
  return {
    entries: fixes
      .filter(({ edits }) => edits.some((edit) => changesText(edit, snapshot)))
      .sort(fixOrder)
      .map((fix) => ({ recipe: recipe.id, safety: recipe.safety, fix })),
    notes: planned.notes ?? [],
  };
}

function planPass(run, snapshot) {
  const entries = [];
  const notes = [];
  for (const recipe of run.active.filter(({ id }) => !run.failed.has(id))) {
    try {
      const planned = planRecipe(recipe, snapshot, run);
      entries.push(...planned.entries);
      notes.push(...planned.notes);
    } catch (error) {
      run.failed.set(recipe.id, fixerError(`fix-recipe ${recipe.id}`, error));
    }
  }
  return { entries, notes };
}

function movedNames(names, applied) {
  const moves = new Map(
    applied.flatMap(({ fix }) =>
      fix.edits.filter(({ type }) => type === 'move').map(({ from, to }) => [from, to]),
    ),
  );
  return names.map((name) => moves.get(name) ?? name);
}

function findingText({ recipe, fix }) {
  const { path: name, line } = fix.finding;
  return `${name}:${line} ${ruleName(fix.finding)} (${recipe})`;
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
  state.applyErrors.push(...errors);
  state.fixed.push(...applied);
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

export function runRecipes({
  projectRoot,
  files,
  recipes,
  preset,
  selectedRules = [],
  accepts,
  writer = directWriter(projectRoot),
}) {
  const run = {
    active: activeRecipes(recipes, { preset, selectedRules }),
    settings: { projectRoot, accepts, writer },
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
    fixedFindings: state.fixed.map(findingText),
    files: files.map((file, index) =>
      state.names[index] === file.path ? file : { ...file, path: state.names[index] },
    ),
    toolErrors: [...run.failed.values(), ...applyError(state.applyErrors)],
    notes: [...new Set(state.notes), ...closingNotes(state, leftovers)],
  };
}
