import { fixerError } from '../common/fix-command.mjs';
import { applyFixes } from './edits/apply-edits.mjs';
import { acceptFixes, checkFix, fixOrder } from './edits/check-fixes.mjs';
import { createSnapshot } from './edits/snapshot.mjs';
import { activeRecipes, ruleName } from './recipes.mjs';

export const MAX_PASSES = 3;

function planRecipe(recipe, snapshot, settings) {
  const planned = recipe.plan({ files: snapshot.files, read: snapshot.read });
  if (!Array.isArray(planned?.fixes)) {
    throw new Error(`recipe ${recipe.id} returned no fixes list`);
  }
  const fixes = planned.fixes.filter(
    ({ finding } = {}) =>
      settings.selected.size === 0 || settings.selected.has(ruleName(finding ?? {})),
  );
  for (const fix of fixes) {
    checkFix(fix, recipe, { ...settings, snapshot });
  }
  return {
    entries: [...fixes].sort(fixOrder).map((fix) => ({ recipe: recipe.id, fix })),
    notes: planned?.notes ?? [],
  };
}

function planPass(recipes, snapshot, settings, failed) {
  const entries = [];
  const notes = [];
  for (const recipe of recipes.filter(({ id }) => !failed.has(id))) {
    try {
      const planned = planRecipe(recipe, snapshot, settings);
      entries.push(...planned.entries);
      notes.push(...planned.notes);
    } catch (error) {
      failed.set(recipe.id, fixerError(`fix-recipe ${recipe.id}`, error));
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
  const changed = [...state.changedMeanwhile];
  return [
    ...(changed.length === 0
      ? []
      : [`--fix left ${changed.join(', ')} as is: the file changed while --fix ran`]),
    ...leftovers.map(leftNote),
  ];
}

function runPass(active, settings, state, failed) {
  const snapshot = createSnapshot(settings.projectRoot, state.names);
  const changed = new Set(state.names);
  const planned = planPass(active, snapshot, { ...settings, changed }, failed);
  const { accepted, skipped } = acceptFixes(planned.entries);
  const { applied, changedMeanwhile } = applyFixes(settings.projectRoot, snapshot, accepted);
  changedMeanwhile.forEach((name) => state.changedMeanwhile.add(name));
  state.fixed.push(...applied);
  state.names = movedNames(state.names, applied);
  state.notes = planned.notes;
  return { applied, skipped };
}

function remaining(active, settings, state, failed) {
  const snapshot = createSnapshot(settings.projectRoot, state.names);
  const changed = new Set(state.names);
  return planPass(active, snapshot, { ...settings, changed }, failed).entries;
}

function settle(active, settings, state, failed) {
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const { applied, skipped } = runPass(active, settings, state, failed);
    if (applied.length === 0) {
      return skipped;
    }
  }
  return remaining(active, settings, state, failed);
}

export function runRecipes({ projectRoot, files, recipes, preset, selectedRules = [], accepts }) {
  const active = activeRecipes(recipes, { preset, selectedRules });
  const settings = { projectRoot, accepts, selected: new Set(selectedRules) };
  const failed = new Map();
  const state = {
    names: files.map(({ path: name }) => name),
    fixed: [],
    changedMeanwhile: new Set(),
    notes: [],
  };
  const leftovers = active.length === 0 ? [] : settle(active, settings, state, failed);
  return {
    fixedFindings: state.fixed.map(findingText),
    files: files.map((file, index) =>
      state.names[index] === file.path ? file : { ...file, path: state.names[index] },
    ),
    toolErrors: [...failed.values()],
    notes: [...new Set(state.notes), ...closingNotes(state, leftovers)],
  };
}
