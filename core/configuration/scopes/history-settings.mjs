import { configError, isPlainObject } from '../../../shared/config.mjs';
import { CO_CHANGE_LIMITS } from '../../../shared/project-rules/hygiene-rules.mjs';
import { suggestionOrAllowed } from '../../../shared/messages/closest-match.mjs';

const THRESHOLD_KEYS = ['commits', 'minSupport', 'minConfidence', 'maxCommitFiles'];
const HISTORY_KEYS = ['coChange', ...THRESHOLD_KEYS];

const WHOLE_NUMBER_BOUNDS = {
  commits: { min: CO_CHANGE_LIMITS.minHistory, max: CO_CHANGE_LIMITS.maxCommits },
  minSupport: { min: CO_CHANGE_LIMITS.minSupport, max: Number.MAX_SAFE_INTEGER },
  maxCommitFiles: { min: CO_CHANGE_LIMITS.minCommitFiles, max: CO_CHANGE_LIMITS.maxCommitFiles },
};

function validateWholeNumber(history, key) {
  const value = history[key];
  const { min, max } = WHOLE_NUMBER_BOUNDS[key];
  if (!Number.isInteger(value) || value < min || value > max) {
    const range =
      max === Number.MAX_SAFE_INTEGER
        ? `at least ${String(min)}`
        : `from ${String(min)} to ${String(max)}`;
    throw configError(`"history.${key}" must be a whole number ${range}`);
  }
}

function validateConfidence(confidence) {
  if (typeof confidence !== 'number' || !(confidence > 0 && confidence <= 1)) {
    throw configError('"history.minConfidence" must be a number above 0 and at most 1');
  }
}

function validateShape(history) {
  if (!isPlainObject(history)) {
    throw configError('"history" must be an object');
  }
  const unknown = Object.keys(history).find((key) => !HISTORY_KEYS.includes(key));
  if (unknown !== undefined) {
    throw configError(
      `unknown history key "${unknown}"${suggestionOrAllowed(unknown, HISTORY_KEYS, 'Allowed history keys')}`,
    );
  }
  if (history.coChange !== undefined && typeof history.coChange !== 'boolean') {
    throw configError('"history.coChange" must be true or false');
  }
}

export function validateHistory(history) {
  if (history === undefined) {
    return;
  }
  validateShape(history);
  const settings = THRESHOLD_KEYS.filter((key) => history[key] !== undefined);
  if (settings.length > 0 && history.coChange === undefined) {
    throw configError(`"history.${settings[0]}" has no effect until "history.coChange" is true`);
  }
  for (const key of settings) {
    if (key === 'minConfidence') {
      validateConfidence(history[key]);
    } else {
      validateWholeNumber(history, key);
    }
  }
}
