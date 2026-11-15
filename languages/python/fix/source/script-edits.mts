import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { PlanFile, ScriptResult } from '../typed/fix-types.mts';
import type { ScriptSettings } from '../typed/script-types.mts';
import { projectSources } from './project-sources.mts';

export const FIX_SCRIPT = path.resolve(import.meta.dirname, 'script/fix_edits.py');
export const SCRIPT_OPERATION = 'python-fix-edits';
type Attempt = { value: ScriptResult } | { error: unknown };
type EditsContext = { projectRoot: string } | undefined;

const parseResult: (text: string) => ScriptResult = JSON.parse;
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export function localRunScript(input: string): string {
  const result = spawnSync(PYTHON, ['-I', FIX_SCRIPT], {
    input,
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${SCRIPT_OPERATION} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout;
}

function attempt(compute: () => ScriptResult): Attempt {
  try {
    return { value: compute() };
  } catch (error) {
    return { error };
  }
}

export function scriptEdits({
  runScript,
  optionsFor,
  rules,
}: ScriptSettings & { rules: string[] }): (
  files: readonly PlanFile[],
  context?: EditsContext,
) => ScriptResult {
  const cache = new WeakMap<readonly PlanFile[], Map<string, Attempt>>();
  function compute(files: readonly PlanFile[], context: EditsContext): ScriptResult {
    const sources = files.filter(({ path: name }) => name.endsWith('.py'));
    if (sources.length === 0) {
      return { fixes: [], declines: [] };
    }
    const reads = context === undefined ? [] : projectSources(context.projectRoot, files);
    const input = JSON.stringify({
      files: sources,
      reads,
      options: optionsFor(files),
      rules,
    });
    return parseResult(runScript(input));
  }
  return function editsOf(files: readonly PlanFile[], context?: EditsContext): ScriptResult {
    const key = context === undefined ? 'files' : 'project';
    const results = cache.get(files) ?? new Map<string, Attempt>();
    cache.set(files, results);
    const outcome = results.get(key) ?? attempt(() => compute(files, context));
    results.set(key, outcome);
    if ('error' in outcome) {
      throw outcome.error;
    }
    return outcome.value;
  };
}
