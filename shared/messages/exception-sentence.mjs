export const PLACEHOLDER_REASONS = ['...'];

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
    reason: PLACEHOLDER_REASONS[0],
  });
}

/** The one sentence every message uses to name the config entry that accepts its finding. */
export function exceptionSentence(entryText) {
  return `If this is intended, add ${entryText} to "exceptions" in nitpicker.config.json.`;
}

/** `message` ended with a full stop, then `sentence`. */
export function appendSentence(message, sentence) {
  return `${message.replace(/\.?\s*$/, '')}. ${sentence}`;
}

const FOLDER_SUFFIXES = ['', '/**', '/*'];

function pathWithSuffix(path, suffix) {
  if (path !== '.') {
    return `${escapeGlob(path)}${suffix}`;
  }
  return suffix === '' ? path : suffix.slice(1);
}

/** `message` with the file or folder the sentence names replaced, for a finding whose path gained a prefix. */
export function retargetSentence(message, fromPath, toPath) {
  return FOLDER_SUFFIXES.reduce(
    (text, suffix) =>
      text.replaceAll(
        `"paths":[${JSON.stringify(pathWithSuffix(fromPath, suffix))}]`,
        `"paths":[${JSON.stringify(pathWithSuffix(toPath, suffix))}]`,
      ),
    message,
  );
}
