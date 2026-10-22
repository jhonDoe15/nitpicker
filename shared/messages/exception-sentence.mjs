export const PLACEHOLDER_REASON = '...';

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Whether `reason` says nothing: blank, or only punctuation such as the `...` a message prints. */
export function isPlaceholderReason(reason) {
  return !WORD_CHARACTER.test(reason);
}

const GLOB_CHARACTERS = /[{}[\],*?\\]/gu;

/** A path as a glob that matches exactly that path. */
export function escapeGlob(path) {
  return path.replaceAll(GLOB_CHARACTERS, String.raw`\$&`);
}

/**
 * The `exceptions` entry, as JSON, that accepts a finding. `path` is one file, folder or package;
 * `glob` is an entry's own glob. `function` and `name` narrow it to one function or declaration.
 */
export function exceptionEntryText({ rule, path, glob, function: functionName, name, packages }) {
  return JSON.stringify({
    rule,
    paths: [glob ?? escapeGlob(path)],
    ...(packages === undefined ? {} : { packages }),
    ...(functionName === undefined ? {} : { function: functionName }),
    ...(name === undefined ? {} : { name }),
    reason: PLACEHOLDER_REASON,
  });
}

/**
 * The one sentence every message uses to name the config entry that accepts its finding. `key` is
 * the config list that takes the entry: `"exceptions"`, or `"python.exceptions"` for the Python
 * rules the top-level list does not take.
 */
export function exceptionSentence(entryText, key = 'exceptions') {
  return `If this is intended, add ${entryText} to "${key}" in nitpicker.config.json.`;
}

/** Whether `message` already ends with a sentence that names its exception entry. */
export function hasExceptionRoute(message) {
  return /If this is intended, add \{.*\} to "(?:python\.)?exceptions" in nitpicker\.config\.json\.$/su.test(
    message,
  );
}

/** `message` ended with a full stop, then `sentence`; `message` as it is without a sentence. */
export function appendSentence(message, sentence) {
  if (sentence === undefined) {
    return message;
  }
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
