import { defineRecipes } from '../../../../../core/fix/engine/recipes.mjs';
import { REVIEW } from '../../../../../core/fix/engine/safety.mjs';
import { declineNote } from '../python-recipes.mjs';
import { projectPayload } from './project-payload.mjs';

const RULES_TOOL = 'python-rules';
const PRESET = 'python';
const PROJECT_MODE = 'project';
const IGNORES_MODE = 'ignores';
const IGNORE_INPUT = 'pythonUnusedIgnores';

function cached(compute) {
  const results = new WeakMap();
  return function lookup(files, key, build) {
    if (!results.has(files)) {
      results.set(files, new Map());
    }
    const byKey = results.get(files);
    if (!byKey.has(key)) {
      byKey.set(key, compute(build()));
    }
    return byKey.get(key);
  };
}

function resultOf(found) {
  return {
    fixes: found.fixes,
    notes: found.declines.map(declineNote),
  };
}

function projectRecipe({ id, rule, lookup, optionsFor }) {
  return {
    id,
    rules: [{ tool: RULES_TOOL, rule }],
    presets: [PRESET],
    scope: 'project',
    safety: REVIEW,
    plan(context) {
      const found = lookup(context.files, rule, () => {
        const payload = projectPayload(context);
        return {
          mode: PROJECT_MODE,
          ...payload,
          options: optionsFor(payload.files),
          rules: [rule],
        };
      });
      return resultOf(found);
    },
  };
}

function unusedIgnoreRecipe({ lookup }) {
  return {
    id: 'python-unused-ignore',
    rules: [{ tool: 'mypy', rule: 'unused-ignore' }],
    presets: [PRESET],
    scope: 'file',
    safety: REVIEW,
    plan({ files, inputs }) {
      const recorded = inputs?.[IGNORE_INPUT];
      if (recorded === undefined || Object.keys(recorded).length === 0) {
        return { fixes: [], notes: [] };
      }
      const found = lookup(recorded, IGNORE_INPUT, () => ({
        mode: IGNORES_MODE,
        files: Object.entries(recorded).map(([name, entry]) => ({ path: name, text: entry.text })),
        ignores: Object.entries(recorded).flatMap(([name, entry]) =>
          entry.ignores.map((item) => ({ path: name, ...item })),
        ),
      }));
      const current = new Map(files.map(({ path: name, text }) => [name, text]));
      return resultOf({
        fixes: found.fixes.filter(
          ({ finding }) => current.get(finding.path) === recorded[finding.path].text,
        ),
        declines: found.declines,
      });
    },
  };
}

export function projectScriptRecipes({ runScript, optionsFor }) {
  const lookup = cached((payload) => JSON.parse(runScript(JSON.stringify(payload))));
  return defineRecipes([
    projectRecipe({
      id: 'python-forwarding-wrapper',
      rule: 'forwarding-wrapper',
      lookup,
      optionsFor,
    }),
    projectRecipe({ id: 'python-unused-option', rule: 'unused-option', lookup, optionsFor }),
    unusedIgnoreRecipe({ lookup }),
  ]);
}
