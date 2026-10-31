import { DEFAULT_LIBRARIES } from '../rules/libraries/project-libraries.mjs';

const SUBJECT = '<name>';

/** The allowed form a hint gives, with the default libraries and a placeholder for the name it is about. */
export function allowedOf(hint) {
  return typeof hint.allowed === 'function'
    ? hint.allowed(SUBJECT, DEFAULT_LIBRARIES)
    : hint.allowed;
}

/** What a hint says the finding is, with a placeholder for the name it is about. */
export function describedBy(hint) {
  return hint.describe?.(SUBJECT, DEFAULT_LIBRARIES);
}
