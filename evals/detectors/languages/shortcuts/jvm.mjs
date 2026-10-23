import { closingBracket, lineOfIndex } from '../occurrences.mjs';

const BROAD_CATCH =
  /(?<![\w.])(?:(?:java\.lang|kotlin)\.)?(Exception|RuntimeException|Throwable|Error)\b/gu;
const NON_NULL = /([\w.]+(?:\(\))?)\s*!!/gu;
const UNSAFE_CAST = /\bas(?!\?)\s+([A-Za-z_][\w.]*(?:<[^>\n]*>)?\??)/gu;

const nextCode = (masked, from) => from + masked.slice(from).search(/\S|$/u);

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

function catchOccurrences({ masked }) {
  return catchClauses(masked).flatMap((clause) => {
    const types = [...clause.parameter.matchAll(BROAD_CATCH)].map((match) => match[1]);
    const line = lineOfIndex(masked, clause.index);
    if (clause.body.trim() === '') {
      const shown = clause.parameter.replaceAll(/\s+/gu, ' ').trim();
      return [
        { kind: 'ignored-error', key: `catch|${shown}`, line, detail: `empty catch (${shown})` },
      ];
    }
    return types.length === 0
      ? []
      : [
          {
            kind: 'broad-catch',
            key: `broad|${types.join('|')}`,
            line,
            detail: `catch of ${types.join(', ')} hides which failure happened`,
          },
        ];
  });
}

const nonNullOccurrences = ({ masked }) =>
  [...masked.matchAll(NON_NULL)].map((match) => ({
    kind: 'non-null-assertion',
    key: `!!|${match[1]}`,
    line: lineOfIndex(masked, match.index),
    detail: `non-null assertion: ${match[1]}!!`,
  }));

// `import a.B as C` renames, so only `as` outside import lines is a cast.
function castOccurrences({ masked }) {
  const lines = masked.split('\n');
  return lines.flatMap((line, index) =>
    /^\s*import\b/u.test(line)
      ? []
      : [...line.matchAll(UNSAFE_CAST)].map((match) => ({
          kind: 'type-assertion',
          key: `as|${match[1]}`,
          line: index + 1,
          detail: `unsafe cast: as ${match[1]}`,
        })),
  );
}

/**
 * The swallowed errors and type escapes in a Java or Kotlin file, as `{ kind, key, line, detail }`,
 * found in code with comments and string contents blanked out. `ignored-error`: a `catch` with an
 * empty body (a comment does not count). `broad-catch`: a `catch` of `Exception`,
 * `RuntimeException`, `Throwable` or `Error`, also as one alternative of a multi-catch. Kotlin
 * only: `non-null-assertion` (`x!!`) and `type-assertion` (`as T`, not the safe `as?`, and not the
 * rename in `import a.B as C`).
 */
export function jvmShortcuts({ language, masked }) {
  const common = catchOccurrences({ masked });
  return language === 'kotlin'
    ? [...common, ...nonNullOccurrences({ masked }), ...castOccurrences({ masked })]
    : common;
}
