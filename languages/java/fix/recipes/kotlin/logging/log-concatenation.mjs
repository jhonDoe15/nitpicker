import { operands } from '../../../../adapters/kotlin/scan/logging/log-format-rules.mjs';
import { trimmed } from '../../../../adapters/kotlin/scan/regexes/regex-values.mjs';
import { logCalls } from '../../../../adapters/kotlin/scan/log-calls.mjs';
import { literalAt } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { logTemplates } from '../../../../adapters/kotlin/scan/rules/calls.mjs';
import { templatePieces } from '../../../../adapters/kotlin/scan/security/sql-values.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const PLACEHOLDER_LEVELS = new Set(['info', 'warn', 'error']);
const PLACEHOLDER_LOGGER = /^\s*import\s+(?:org\.slf4j|org\.apache\.logging\.log4j)\./mu;
const PLAIN_OPERAND = /^[\w.\s?!]+$/u;

function withoutGroups(text) {
  let depth = 0;
  let kept = '';
  for (const character of text) {
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (depth === 0) {
      kept += character;
    }
  }
  return kept;
}

function piecesOf(scanned, operand, first) {
  const { start, end } = trimmed(scanned.source, operand);
  const literal = literalAt(scanned, start);
  if (literal !== undefined) {
    const plain = literal.end === end && !literal.raw && !literal.text.includes('\\');
    return plain ? templatePieces(literal) : undefined;
  }
  if (first || !PLAIN_OPERAND.test(withoutGroups(scanned.code.slice(start, end)))) {
    return undefined;
  }
  return [{ expression: scanned.source.slice(start, end) }];
}

function rewritten(scanned, message) {
  const parts = operands(scanned.code, message).map((operand, index) =>
    piecesOf(scanned, operand, index === 0),
  );
  const first = trimmed(scanned.source, operands(scanned.code, message)[0]);
  if (parts.includes(undefined) || literalAt(scanned, first.start) === undefined) {
    return undefined;
  }
  const pieces = parts.flat();
  const text = pieces.map((piece) => piece.text ?? '{}').join('');
  const values = pieces.filter((piece) => piece.expression !== undefined);
  const holders = pieces.some(({ text: value }) => value?.includes('{}'));
  const quoted = pieces.some(({ text: value }) => value?.includes('"'));
  return holders || quoted || values.length === 0
    ? undefined
    : `"${text}", ${values.map(({ expression }) => expression).join(', ')}`;
}

export const logConcatenationRecipe = kotlinRecipe({
  id: 'kotlin-log-string-concatenation',
  rules: [{ tool: 'kotlin-source', rule: 'LogStringConcatenation' }],
  safety: 'review',
  where: 'both',
  find(scanned) {
    if (!PLACEHOLDER_LOGGER.test(scanned.code)) {
      return [];
    }
    const flagged = new Set(logTemplates(scanned).map(({ offset }) => offset));
    return logCalls(scanned.code).flatMap((call) => {
      const [message, ...others] = call.arguments;
      const text = flagged.has(call.start) && others.length === 0 && call.lambda === undefined;
      const replacement =
        text && PLACEHOLDER_LEVELS.has(call.method) ? rewritten(scanned, message) : undefined;
      return replacement === undefined
        ? []
        : [
            {
              offset: call.start,
              edits: [{ ...trimmed(scanned.source, message), text: replacement }],
            },
          ];
    });
  },
});
