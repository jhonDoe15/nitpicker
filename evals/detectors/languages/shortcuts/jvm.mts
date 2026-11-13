import { capture } from '../../common/matches.mts';
import type { Language, Occurrence } from '../../common/types.mts';
import { closingBracket, lineOfIndex, nextCode } from '../text.mts';
import { javaCasts, kotlinCasts, nonNullAssertions } from './casts.mts';
import { handlerFinding, statementsOf } from './handlers.mts';

const BROAD_CATCH =
  /(?<![\w.])(?:(?:java\.lang|kotlin)\.)?(Exception|RuntimeException|Throwable|Error|NullPointerException)\b/gu;
const RUN_CATCHING = /\brunCatching\b/gu;
const DISCARDED = /^\s*\.\s*(?:getOrNull|getOrDefault|exceptionOrNull)\s*\(/u;

type CatchClause = { parameter: string; body: string; index: number };

function catchClauses(masked: string): CatchClause[] {
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

function catchOccurrences({
  language,
  masked,
}: {
  language: Language;
  masked: string;
}): Occurrence[] {
  return catchClauses(masked).flatMap((clause) => {
    const shown = clause.parameter.replaceAll(/\s+/gu, ' ').trim();
    const found = handlerFinding({
      language,
      body: clause.body,
      statements: statementsOf(clause.body),
      broadTypes: [...clause.parameter.matchAll(BROAD_CATCH)].map((match) => capture(match, 1)),
      shown: `catch (${shown})`,
    });
    const line = lineOfIndex(masked, clause.index);
    return found === undefined ? [] : [{ ...found, line }];
  });
}

function runCatchingOccurrences({ masked }: { masked: string }): Occurrence[] {
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

export function jvmShortcuts({
  language,
  masked,
}: {
  language: Language;
  masked: string;
}): Occurrence[] {
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
