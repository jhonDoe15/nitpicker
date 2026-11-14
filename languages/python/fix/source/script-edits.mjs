import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { projectSources } from './project-sources.mjs';

export const FIX_SCRIPT = path.resolve(import.meta.dirname, 'script/fix_edits.py');
export const SCRIPT_OPERATION = 'python-fix-edits';
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export function localRunScript(input) {
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

function attempt(compute) {
  try {
    return { value: compute() };
  } catch (error) {
    return { error };
  }
}

export function scriptEdits({ runScript, optionsFor, rules }) {
  const cache = new WeakMap();
  function compute(files, context) {
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
    return JSON.parse(runScript(input));
  }
  return function editsOf(files, context) {
    const key = context === undefined ? 'files' : 'project';
    if (!cache.has(files)) {
      cache.set(files, new Map());
    }
    const results = cache.get(files);
    if (!results.has(key)) {
      results.set(
        key,
        attempt(() => compute(files, context)),
      );
    }
    const { value, error } = results.get(key);
    if (error !== undefined) {
      throw error;
    }
    return value;
  };
}
