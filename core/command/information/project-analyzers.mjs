import { describeError } from '../../../shared/messages/error-chain.mjs';
import { applyDisable, loadConfig } from '../../configuration/config.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { resolveRunTarget } from '../../scope/run-target.mjs';
import { missingPathHint } from '../arguments.mjs';

function analyzerNames(config) {
  const builtIn = applyDisable(presetAnalyzers(config), config).map(({ name }) => name);
  return [...builtIn, ...(config.analyzers ?? []).map(({ name }) => name)];
}

/** The analyzers `--analyzer` takes in the project a run with `options` would check, or why not. */
export function projectAnalyzers(cli) {
  try {
    const { currentProjectRoot } = resolveRunTarget({ ...cli, missingPathHint });
    const config = loadConfig(currentProjectRoot);
    return { preset: config.preset ?? 'typescript', names: analyzerNames(config) };
  } catch (error) {
    return { error: describeError(error) };
  }
}
