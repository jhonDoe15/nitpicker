import { logCalls as untypedLogCalls } from '../../../../adapters/kotlin/scan/log-calls.mjs';
import { operands as untypedOperands } from '../../../../adapters/kotlin/scan/logging/log-format-rules.mjs';
import { trimmed as untypedTrimmed } from '../../../../adapters/kotlin/scan/regexes/regex-values.mjs';
import { logTemplates as untypedLogTemplates } from '../../../../adapters/kotlin/scan/rules/calls.mjs';
import { templatePieces as untypedTemplatePieces } from '../../../../adapters/kotlin/scan/security/sql-values.mjs';
import { withoutGroups } from '../shared/boundaries.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { literalAt } from '../shared/kotlin-scan.mts';
import type { ScannedKotlin, Span } from '../shared/kotlin-scan.mts';

type TemplatePiece = { readonly text?: string; readonly expression?: string };

type LogCall = {
  readonly start: number;
  readonly method: string;
  readonly arguments: readonly Span[];
  readonly lambda?: unknown;
};

const logCalls: (code: string) => readonly LogCall[] = untypedLogCalls;

const operands: (code: string, span: Span) => readonly Span[] = untypedOperands;

const trimmed: (code: string, span: Span) => Span = untypedTrimmed;

const logTemplates: (scanned: ScannedKotlin) => readonly { readonly offset: number }[] =
  untypedLogTemplates;

const templatePieces: (literal: {
  readonly text: string;
  readonly raw: boolean;
}) => readonly TemplatePiece[] = untypedTemplatePieces;

const PLACEHOLDER_LEVELS = new Set(['info', 'warn', 'error']);
const PLACEHOLDER_LOGGER = /^\s*import\s+(?:org\.slf4j|org\.apache\.logging\.log4j)\./mu;
const PLAIN_OPERAND = /^[\w.\s?!]+$/u;

function piecesOf(
  scanned: ScannedKotlin,
  operand: Span,
  first: boolean,
): readonly TemplatePiece[] | undefined {
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

function rewritten(scanned: ScannedKotlin, message: Span): string | undefined {
  const spans = operands(scanned.code, message);
  const parts = spans.map((operand, index) => piecesOf(scanned, operand, index === 0));
  const resolved = parts.filter((part) => part !== undefined);
  const [head] = spans;
  if (head === undefined || resolved.length < parts.length) {
    return undefined;
  }
  const first = trimmed(scanned.source, head);
  if (literalAt(scanned, first.start) === undefined) {
    return undefined;
  }
  const pieces = resolved.flat();
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
        text && PLACEHOLDER_LEVELS.has(call.method) && message !== undefined
          ? rewritten(scanned, message)
          : undefined;
      return replacement === undefined || message === undefined
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
