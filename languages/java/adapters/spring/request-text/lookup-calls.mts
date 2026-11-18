import { escapeRegExp } from '../typed/shared-views.mts';
import type { CallBefore, HelperInfo, HelperTarget, LookupItem } from './request-types.mts';
const CONTROL_WORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'when',
  'try',
]);

export function isControlWord(word: string): boolean {
  return CONTROL_WORDS.has(word);
}
const IDENTIFIER_WORDS = ['Id', 'Ids', 'Uuid', 'Guid', 'Key', 'Token', 'Code', 'Slug', 'Hash'];
const IDENTIFIER_SUFFIX = [...IDENTIFIER_WORDS, 'Status', 'Type', 'Role', 'Kind'].join('|');
const IDENTIFIER_WHOLE = [...IDENTIFIER_SUFFIX.split('|'), 'Sort', 'Order', 'Page', 'Size']
  .map((word) => word.toLowerCase())
  .join('|');
const IDENTIFIER_NAME = new RegExp(
  `(?:^|[a-z])(?:${IDENTIFIER_SUFFIX})$|^(?:${IDENTIFIER_WHOLE})$`,
  'u',
);
const FINDER =
  /^(?:find|read|get|query|stream|search|exists|count|delete)(?:All|First|Top\d*|Distinct)*By(\w+)$/u;
const TEXT_MATCH = /StartingWith|EndingWith|Containing|Contains|Like|IgnoreCase|Equals/u;
const BINDING_CALLS = new Set([
  'setParameter',
  'addValue',
  'like',
  'ilike',
  'equal',
  'equalsIgnoreCase',
]);
const JDBC_CALL = /^(?:query|queryFor\w+|update|batchUpdate)$/u;
const JDBC_RECEIVER = /(?:jdbc|template|sql)\w*\s*\.\s*$/iu;
const HELPER_DEPTH = 2;
const TRIMMING = /\b(?:trim\w*|strip\w*|normali[sz]e\w*|sanitize\w*)\b/u;

export function isIdentifierName(name: string): boolean {
  return IDENTIFIER_NAME.test(name);
}

export function isTrimmedLine(line: string, name: string): boolean {
  return new RegExp(String.raw`\b${escapeRegExp(name)}\b`, 'u').test(line) && TRIMMING.test(line);
}

function finderLooksUpText(call: string): boolean {
  const finder = FINDER.exec(call);
  if (finder === null) {
    return false;
  }
  const text = finder[1] ?? '';
  const fields = text.split(/And|Or/u).filter((field) => field !== '');
  return TEXT_MATCH.test(text) || fields.some((field) => !isIdentifierName(field));
}

function openingsBefore(body: string, start: number): { open: number; commas: number }[] {
  const openings: { open: number; commas: number }[] = [];
  let depth = 0;
  let commas = 0;
  const reversed = Array.from(body).slice(0, start).reverse();
  for (const [offset, character] of reversed.entries()) {
    depth += character === ')' ? 1 : 0;
    const encloses = character === '(' && depth === 0;
    if (encloses) {
      openings.push({ open: start - 1 - offset, commas });
      commas = 0;
    }
    depth -= character === '(' && !encloses ? 1 : 0;
    commas += character === ',' && depth === 0 ? 1 : 0;
  }
  return openings;
}

export function callBefore(body: string, start: number): CallBefore | undefined {
  for (const { open, commas } of openingsBefore(body, start)) {
    const head = body.slice(0, open);
    const name = /(\w+)\s*$/u.exec(head);
    if (name !== null && !isControlWord(name[1] ?? '')) {
      return { name: name[1] ?? '', receiver: head.slice(0, name.index), position: commas };
    }
  }
  return undefined;
}

export function isArgument(body: string, index: number, length: number): boolean {
  const before = body.slice(0, index).trimEnd();
  const after = body.slice(index + length).trimStart();
  return /[(,]$/u.test(before) && /^[),]/u.test(after);
}

function isDirectLookup({ name, receiver }: CallBefore): boolean {
  return (
    finderLooksUpText(name) ||
    BINDING_CALLS.has(name) ||
    (JDBC_CALL.test(name) && JDBC_RECEIVER.test(receiver))
  );
}

function argumentCalls(body: string, name: string): CallBefore[] {
  const pattern = new RegExp(String.raw`\b${escapeRegExp(name)}\b`, 'gu');
  return [...body.matchAll(pattern)]
    .filter((match) => isArgument(body, match.index, match[0].length))
    .map((match) => callBefore(body, match.index))
    .filter((call): call is CallBefore => call !== undefined);
}

function helperTarget(
  call: CallBefore,
  helpers: ReadonlyMap<string, HelperInfo>,
): HelperTarget | undefined {
  const helper = helpers.get(call.name);
  const name = helper?.parameters[call.position];
  if (helper === undefined || name === undefined) {
    return undefined;
  }
  const trimmed = helper.body.split('\n').some((line) => isTrimmedLine(line, name));
  return trimmed ? undefined : { helper, name };
}

export function isLookup(
  call: CallBefore | undefined,
  helpers: ReadonlyMap<string, HelperInfo>,
): boolean {
  const pending: LookupItem[] = call === undefined ? [] : [{ call, depth: 0 }];
  for (const { call: current, depth } of pending) {
    if (isDirectLookup(current)) {
      return true;
    }
    const target = depth < HELPER_DEPTH ? helperTarget(current, helpers) : undefined;
    for (const next of target === undefined ? [] : argumentCalls(target.helper.body, target.name)) {
      pending.push({ call: next, depth: depth + 1 });
    }
  }
  return false;
}
