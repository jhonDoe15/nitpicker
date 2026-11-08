import { describeError } from '../../../shared/messages/error-chain.mjs';
import { applyDisable } from '../../configuration/config.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { DEFAULT_PRESET, nearestConfig } from '../reference/project-config.mjs';

function analyzerNames(config) {
  const builtIn = applyDisable(presetAnalyzers(config), config).map(({ name }) => name);
  return [...builtIn, ...(config.analyzers ?? []).map(({ name }) => name)];
}

/** The analyzers `--analyzer` takes in the project at or above `currentProjectRoot`, or why not. */
export function projectAnalyzers(currentProjectRoot) {
  try {
    const config = nearestConfig(currentProjectRoot);
    const preset = config.preset ?? DEFAULT_PRESET;
    return { preset, names: analyzerNames({ ...config, preset }) };
  } catch (error) {
    return { error: describeError(error) };
  }
}
