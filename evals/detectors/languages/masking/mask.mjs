import { maskCLike } from './c-like.mjs';
import { maskPython } from './python.mjs';

const LANGUAGES = new Map([
  ['.py', 'python'],
  ['.pyi', 'python'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
]);

/** `python`, `java` or `kotlin` for a source path, undefined for any other file. */
export function languageOf(file) {
  return LANGUAGES.get(/\.[^./]+$/u.exec(file)?.[0]);
}

/**
 * The source with comments and string contents blanked out (same length, same lines), and the
 * comments found, as `{ text, line, block }` with the delimiters removed. `keepStrings` blanks the
 * comments only.
 */
export function maskSource(language, text, { keepStrings = false } = {}) {
  return language === 'python'
    ? maskPython(text, { keepStrings })
    : maskCLike(text, { kotlin: language === 'kotlin', keepStrings });
}
