export const PLACEHOLDER_REASONS = ['...', '<why this is intended>'];

const GLOB_CHARACTERS = /[{}[\],*?\\]/gu;

/** A path as a glob that matches exactly that path. */
export function escapeGlob(path) {
  return path.replaceAll(GLOB_CHARACTERS, String.raw`\$&`);
}

/**
 * The `exceptions` entry, as JSON, that accepts a finding. `path` is one file, folder or package;
 * `glob` is an entry's own glob. `function` and `name` narrow it to one function or declaration.
 */
export function exceptionEntryText({ rule, path, glob, function: functionName, name }) {
  return JSON.stringify({
    rule,
    paths: [glob ?? escapeGlob(path)],
    ...(functionName === undefined ? {} : { function: functionName }),
    ...(name === undefined ? {} : { name }),
    reason: PLACEHOLDER_REASONS[1],
  });
}

/** The one sentence every message uses to name the config entry that accepts its finding. */
export function exceptionSentence(entryText, key = 'exceptions') {
  return `If a reviewer agrees this is intended, add ${entryText} to "${key}" in nitpicker.config.json.`;
}
