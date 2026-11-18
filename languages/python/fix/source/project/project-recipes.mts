import type {
  ScriptRecipe,
  PlanContext,
  PlanFile,
  ScriptPlanned,
  ScriptResult,
} from '../../typed/fix-types.mts';
import type { ScriptOptions, ScriptSettings } from '../../typed/script-types.mts';
import { defineRecipes } from '../../typed/core-views.mts';
import { REVIEW } from '../../../../../core/fix/engine/safety.mjs';
import { declineNote } from '../python-recipes.mts';
import { projectPayload } from './project-payload.mts';

type Payload = Readonly<Record<string, unknown>>;
type Lookup = (files: object, key: string, build: () => Payload) => ScriptResult;

const parseResult: (text: string) => ScriptResult = JSON.parse;
const RULES_TOOL = 'python-rules';
const PRESET = 'python';
const PROJECT_MODE = 'project';
const IGNORES_MODE = 'ignores';
const IGNORE_INPUT = 'pythonUnusedIgnores';

function cached(compute: (payload: Payload) => ScriptResult): Lookup {
  const results = new WeakMap<object, Map<string, ScriptResult>>();
  return function lookup(files: object, key: string, build: () => Payload): ScriptResult {
    const byKey = results.get(files) ?? new Map<string, ScriptResult>();
    results.set(files, byKey);
    const found = byKey.get(key) ?? compute(build());
    byKey.set(key, found);
    return found;
  };
}

function resultOf(found: ScriptResult): ScriptPlanned {
  return {
    fixes: found.fixes,
    notes: found.declines.map(declineNote),
  };
}

function projectRecipe({
  id,
  rule,
  lookup,
  optionsFor,
}: {
  id: string;
  rule: string;
  lookup: Lookup;
  optionsFor: (files: readonly PlanFile[]) => ScriptOptions;
}): ScriptRecipe {
  return {
    id,
    rules: [{ tool: RULES_TOOL, rule }],
    presets: [PRESET],
    scope: 'project',
    safety: REVIEW,
    plan(context: PlanContext): ScriptPlanned {
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

function unusedIgnoreRecipe({ lookup }: { lookup: Lookup }): ScriptRecipe {
  return {
    id: 'python-unused-ignore',
    rules: [{ tool: 'mypy', rule: 'unused-ignore' }],
    presets: [PRESET],
    scope: 'file',
    safety: REVIEW,
    plan({ files, inputs }: PlanContext): ScriptPlanned {
      const recorded = inputs[IGNORE_INPUT];
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
          ({ finding }) => current.get(finding.path) === recorded[finding.path]?.text,
        ),
        declines: found.declines,
      });
    },
  };
}

export function projectScriptRecipes({
  runScript,
  optionsFor,
}: ScriptSettings): readonly ScriptRecipe[] {
  const lookup = cached((payload: Payload) => parseResult(runScript(JSON.stringify(payload))));
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
