import { closingBracket, lineOfIndex, nextCode } from '../text.mjs';
import { javaCasts, kotlinCasts, nonNullAssertions } from './casts.mjs';
import { handlerFinding, statementsOf } from './handlers.mjs';

const BROAD_CATCH =
  /(?<![\w.])(?:(?:java\.lang|kotlin)\.)?(Exception|RuntimeException|Throwable|Error|NullPointerException)\b/gu;
const RUN_CATCHING = /\brunCatching\b/gu;
const DISCARDED = /^\s*\.\s*(?:getOrNull|getOrDefault|exceptionOrNull)\s*\(/u;

// Each `catch (...) { ... }` as `{ parameter, body, index }`, in code with comments blanked out.
function catchClauses(masked) {
  return [...masked.matchAll(/\bcatch\s*\(/gu)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingBracket(masked, open);
    const brace = nextCode(masked, close + 1);
    const end = masked[brace] === '{' ? closingBracket(masked, brace) : -1;
    return close === -1 || end === -1
      ? []
      : [
          {
            parameter: masked.slice(open + 1, close),
            body: masked.slice(brace + 1, end),
            index: match.index,
          },
        ];
  });
}

function catchOccurrences({ language, masked }) {
  return catchClauses(masked).flatMap((clause) => {
    const shown = clause.parameter.replaceAll(/\s+/gu, ' ').trim();
    const found = handlerFinding({
      language,
      body: clause.body,
      statements: statementsOf(clause.body),
      broadTypes: [...clause.parameter.matchAll(BROAD_CATCH)].map((match) => match[1]),
      shown: `catch (${shown})`,
    });
    const line = lineOfIndex(masked, clause.index);
    return found === undefined ? [] : [{ ...found, line }];
  });
}

// `runCatching { ... }.getOrNull()` turns every failure into a missing value.
function runCatchingOccurrences({ masked }) {
  return [...masked.matchAll(RUN_CATCHING)].flatMap((match) => {
    const brace = nextCode(masked, match.index + match[0].length);
    const close = masked[brace] === '{' ? closingBracket(masked, brace) : -1;
    return close !== -1 && DISCARDED.test(masked.slice(close + 1))
      ? [
          {
            kind: 'ignored-error',
            key: 'runCatching',
            line: lineOfIndex(masked, match.index),
            detail: 'runCatching { ... } discards the failure',
          },
        ]
      : [];
  });
}

/**
 * The swallowed errors and type escapes in a Java or Kotlin file, as `{ kind, key, line, detail }`,
 * found in code with comments and string contents blanked out. `ignored-error` and `broad-catch`:
 * the `catch` clauses `handlerFinding` judges (`Exception`, `RuntimeException`, `Throwable`,
 * `Error` and `NullPointerException` are the generic types, also as one alternative of a
 * multi-catch), and Kotlin `runCatching { ... }.getOrNull()`. `type-assertion`: Java `(T) x` and
 * Kotlin `x as T` (not the safe `as?`, not the rename in `import a.B as C`, and not after an
 * `instanceof T` or `is T` check). Kotlin only: `non-null-assertion` (`x!!`).
 */
export function jvmShortcuts({ language, masked }) {
  const common = [...catchOccurrences({ language, masked })];
  return language === 'kotlin'
    ? [
        ...common,
        ...runCatchingOccurrences({ masked }),
        ...nonNullAssertions(masked),
        ...kotlinCasts(masked),
      ]
    : [...common, ...javaCasts(masked)];
}
