import {
  DRIZZLE_FIND,
  DRIZZLE_READS,
  KNEX_TABLE_STEPS,
  isClientName,
} from '../../../../preset/eslint-plugin/rules/support/orm/builders.mts';
import {
  MANAGER_WORDS,
  REPOSITORY_WORDS,
  methodsOf,
} from '../../../../preset/eslint-plugin/rules/support/orm/models.mts';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const READ = 'read';
const STARTS = ['selectFrom', 'createQueryBuilder'];
const PRISMA_READS = [...methodsOf('prisma', READ)];
const REPOSITORY_READS = [...methodsOf('typeorm', READ), ...methodsOf('mikro', READ)];
const SEQUELIZE_READS = [...methodsOf('sequelize', READ)];
const RECEIVER_WORDS = new Set([...REPOSITORY_WORDS, ...MANAGER_WORDS]);
const ESCAPE = /\\[^ntrbfv'"\\`]/u;
const TOKEN = /[\w$]+/gu;
const RECEIVER_WINDOW = 200;
const RECEIVER_END = /[\p{ID_Continue}$\u200C\u200D]+$/u;
const MEMBER_ENDS = new Set(['.', '[', '#', '/', "'", '"', '`']);
const SPACE = '\\s\\u0085\\u180E\\u200B';
const CALL_START = `[${SPACE}!)\\]'"\`]*(?:\\?\\.[${SPACE}]*)?`;
const CALLED = new RegExp(`${CALL_START}(?:\\(|<|\\/|as\\b|satisfies\\b)`, 'uy');
const TRAILING_BLANK = new RegExp(`[${SPACE}]*$`, 'u');
const LINE_BREAKS = ['\n', '\r', '\u2028', '\u2029'];
const STRING_CALLED = new RegExp(
  `${CALL_START}(?:\\([${SPACE}(]*[/'"\`]|<|\\/|as\\b|satisfies\\b)`,
  'uy',
);

type Receiver = (name: string) => boolean;

function occurrences(text: string, name: string): number[] {
  const standalone = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, 'gu');
  return [...text.matchAll(standalone)].map((match) => match.index);
}

function followedBy(pattern: RegExp, text: string, at: number): boolean {
  pattern.lastIndex = at;
  return pattern.test(text);
}

function isStringCall(text: string, name: string): boolean {
  return occurrences(text, name).some((at) => followedBy(STRING_CALLED, text, at + name.length));
}

function lastNonSpace(text: string, from: number): number {
  return from - (TRAILING_BLANK.exec(text.slice(0, from + 1))?.[0].length ?? 0);
}

function receiverEnd(text: string, dot: number): number {
  const at = lastNonSpace(text, dot - 1);
  return text[at] === '?' ? lastNonSpace(text, at - 1) : at;
}

function lineHasComment(text: string, at: number): boolean {
  const start =
    LINE_BREAKS.reduce(
      (latest, lineBreak) => Math.max(latest, text.lastIndexOf(lineBreak, at)),
      -1,
    ) + 1;
  return text.slice(start, at + 1).includes('//');
}

function isMethodCall(text: string, name: string, receiver: Receiver): boolean {
  return occurrences(text, name).some((at) => {
    const member = lastNonSpace(text, at - 1);
    const isMember = MEMBER_ENDS.has(text[member] ?? '') || lineHasComment(text, member);
    if (!(isMember && followedBy(CALLED, text, at + name.length))) {
      return false;
    }
    const end = receiverEnd(text, member);
    if (text[member] !== '.' || lineHasComment(text, end)) {
      return true;
    }
    const head = text.slice(Math.max(0, member - RECEIVER_WINDOW), end + 1);
    const identifier = RECEIVER_END.exec(head)?.[0];
    return identifier === undefined || identifier.length === head.length || receiver(identifier);
  });
}

function isRepositoryName(name: string): boolean {
  return RECEIVER_WORDS.has(wordsOf(name).at(-1) ?? '');
}

function isModelName(name: string): boolean {
  return /^[A-Z]/u.test(name) || name.endsWith('Model');
}

function isTableCall(text: string, tokens: ReadonlySet<string>): boolean {
  return [...tokens].some(
    (token) => (KNEX_TABLE_STEPS.has(token) || isClientName(token)) && isStringCall(text, token),
  );
}

function hasMethodCall(
  text: string,
  tokens: ReadonlySet<string>,
  { names, receiver }: { readonly names: readonly string[]; readonly receiver: Receiver },
): boolean {
  return names.some((name) => tokens.has(name) && isMethodCall(text, name, receiver));
}

function hasAny(tokens: ReadonlySet<string>, names: Iterable<string>): boolean {
  return [...names].some((name) => tokens.has(name));
}

export function mayReadTables(text: string): boolean {
  if (ESCAPE.test(text)) {
    return true;
  }
  const tokens = new Set(text.match(TOKEN));
  const hasClient = [...tokens].some((token) => isClientName(token));
  return (
    hasAny(tokens, STARTS) ||
    (hasClient && (hasAny(tokens, DRIZZLE_READS) || hasAny(tokens, PRISMA_READS))) ||
    (tokens.has('query') && hasAny(tokens, DRIZZLE_FIND)) ||
    isTableCall(text, tokens) ||
    hasMethodCall(text, tokens, { names: REPOSITORY_READS, receiver: isRepositoryName }) ||
    hasMethodCall(text, tokens, { names: SEQUELIZE_READS, receiver: isModelName })
  );
}
