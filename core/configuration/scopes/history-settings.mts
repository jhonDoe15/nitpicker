import { configError } from '../../../shared/config.mjs';
import { isPlainObject } from '../views/config-views.mts';
import { CO_CHANGE_LIMITS } from '../../../shared/project-rules/hygiene-rules.mjs';
import { suggestionOrAllowed } from '../../../shared/messages/closest-match.mjs';

export const HISTORY_THRESHOLD_KEYS = ['commits', 'minSupport', 'minConfidence', 'maxCommitFiles'];
export const HISTORY_KEYS = ['coChange', ...HISTORY_THRESHOLD_KEYS];

type Bounds = { readonly min: number; readonly max: number };

export const WHOLE_NUMBER_BOUNDS = {
  commits: { min: CO_CHANGE_LIMITS.minHistory, max: CO_CHANGE_LIMITS.maxCommits },
  minSupport: { min: CO_CHANGE_LIMITS.minSupport, max: Number.MAX_SAFE_INTEGER },
  maxCommitFiles: { min: CO_CHANGE_LIMITS.minCommitFiles, max: CO_CHANGE_LIMITS.maxCommitFiles },
};

export function isWholeNumberKey(key: string): key is keyof typeof WHOLE_NUMBER_BOUNDS {
  return key in WHOLE_NUMBER_BOUNDS;
}

function validateWholeNumber(
  history: Record<string, unknown>,
  key: keyof typeof WHOLE_NUMBER_BOUNDS,
): void {
  const value = history[key];
  const { min, max }: Bounds = WHOLE_NUMBER_BOUNDS[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    const range =
      max === Number.MAX_SAFE_INTEGER
        ? `at least ${String(min)}`
        : `from ${String(min)} to ${String(max)}`;
    throw configError(`"history.${key}" must be a whole number ${range}`);
  }
}

function validateConfidence(confidence: unknown): void {
  if (typeof confidence !== 'number' || !(confidence > 0 && confidence <= 1)) {
    throw configError('"history.minConfidence" must be a number above 0 and at most 1');
  }
}

function validateShape(history: unknown): Record<string, unknown> {
  if (!isPlainObject(history)) {
    throw configError('"history" must be an object');
  }
  const unknown = Object.keys(history).find((key) => !HISTORY_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown history key "${unknown}"${suggestionOrAllowed(unknown, HISTORY_KEYS, 'Allowed history keys')}`,
    );
  }
  if (history['coChange'] !== undefined && typeof history['coChange'] !== 'boolean') {
    throw configError('"history.coChange" must be true or false');
  }
  return history;
}

export function validateHistory(input: unknown): void {
  if (input === undefined) {
    return;
  }
  const history = validateShape(input);
  const settings = HISTORY_THRESHOLD_KEYS.filter((key) => history[key] !== undefined);
  if (settings.length > 0 && history['coChange'] === undefined) {
    throw configError(
      `"history.${settings[0] ?? ''}" has no effect until "history.coChange" is true`,
    );
  }
  for (const key of settings) {
    if (key === 'minConfidence') {
      validateConfidence(history[key]);
    } else if (isWholeNumberKey(key)) {
      validateWholeNumber(history, key);
    }
  }
}
