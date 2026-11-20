import { fieldOf } from '../../../../shared/values/readers.mts';
import type { JSONSchema } from '@typescript-eslint/utils';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { isTriStateTag } from './tri-state-tags.mts';
import type {
  Grammar,
  JsdocProblem,
  JsdocComment,
  JsdocContext,
  JsdocReport,
  JsdocTag,
  MemberRegion,
  Opener,
  ParsedBody,
  ParsedJsdoc,
  Segment,
  TagEntry,
  TaggedSegment,
  TagSelector,
} from './jsdoc-types.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

const NAME = /^(?:\[[^\]]*\]|[\w$.]+)/;
const NAME_LIST = /^[\w$]+(?:\s*,\s*[\w$]+)*/;
const IMPORT_FORM = /^(?:\{[^}]*\}|\*\s+as\s+[\w$]+)\s+from\s+(?:'[^']+'|"[^"]+")$/;
const STRING_LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;
const STAR_TYPE = /(?<![\w$.])\*(?![\w$.])/;
const BARE_NULLABLE = /(?:^|[<(,|&:[{])\s*\?\s*(?=$|[>),|}\]])/;
const PREFIX_NULLABLE = /(?:^|[<(,|&:[{])\s*\?(?=\s*[\w$({[<])/;
const SUFFIX_NULLABLE = /[\w$>\])]\s*\?(?=\s*(?:$|[|>]))/;
const TAG_LINE = /^\s*@(\w+)/;
const COMMENT_PREFIX = /^\s*\*?\s?/;

const GRAMMARS: ReadonlyMap<string, Grammar> = new Map<string, Grammar>(
  Object.entries({
    param: { type: 'required', name: NAME, usage: '@param {Type} name' },
    property: { type: 'required', name: NAME, usage: '@property {Type} name' },
    prop: { type: 'required', name: NAME, usage: '@prop {Type} name' },
    typedef: { type: 'required', name: NAME, usage: '@typedef {Type} Name' },
    returns: { type: 'required', usage: '@returns {Type}' },
    return: { type: 'required', usage: '@return {Type}' },
    type: { type: 'required', usage: '@type {Type}' },
    satisfies: { type: 'required', usage: '@satisfies {Type}' },
    extends: { type: 'required', usage: '@extends {Type}' },
    augments: { type: 'required', usage: '@augments {Type}' },
    this: { type: 'required', usage: '@this {Type}' },
    callback: { name: NAME, usage: '@callback Name' },
    template: { type: 'optional', name: NAME_LIST, usage: '@template T' },
    import: { whole: IMPORT_FORM, usage: "@import {Name} from 'module'" },
    overload: { usage: '@overload' },
  }),
);

export function isJsdocBlock(comment: Pick<JsdocComment<unknown>, 'type' | 'value'>): boolean {
  return comment.type === 'Block' && comment.value.startsWith('*');
}

function segmentsOf(commentValue: string): { leading: Segment; tagged: TaggedSegment[] } {
  const leading: Segment = { text: '' };
  const tagged: TaggedSegment[] = [];
  let current: Segment = leading;
  for (const line of commentValue.split('\n')) {
    const cleaned = line.replace(COMMENT_PREFIX, '');
    const tag = TAG_LINE.exec(cleaned)?.[1];
    if (tag === undefined) {
      current.text += `${cleaned}\n`;
    } else {
      const segment: TaggedSegment = { tag, text: `${cleaned.replace(TAG_LINE, '')}\n` };
      current = segment;
      tagged.push(segment);
    }
  }
  return { leading, tagged };
}

function takeType(text: string): { type: string; rest: string } | undefined {
  if (!text.startsWith('{')) {
    return undefined;
  }
  const steps: Readonly<Record<string, number>> = { '{': 1, '}': -1 };
  let depth = 0;
  for (const [index, character] of text.split('').entries()) {
    depth += steps[character] ?? 0;
    if (depth === 0) {
      return { type: text.slice(1, index).trim(), rest: text.slice(index + 1).trim() };
    }
  }
  return undefined;
}

function takeName(text: string, pattern: RegExp): { name: string; rest: string } | undefined {
  const matched = pattern.exec(text);
  const [name] = matched ?? [];
  return matched === null || name === undefined
    ? undefined
    : { name: name.trim(), rest: text.slice(name.length).trim() };
}

function parseBody(grammar: Grammar, body: string): ParsedBody | undefined {
  const text = body.trim();
  if (grammar.whole !== undefined) {
    return grammar.whole.test(text) ? { entry: {}, rest: '' } : undefined;
  }
  const typed = takeType(text);
  if (typed === undefined && grammar.type === 'required') {
    return undefined;
  }
  const entry: TagEntry = typed === undefined ? {} : { type: typed.type };
  const afterType = typed === undefined ? text : typed.rest;
  if (grammar.name === undefined) {
    return { entry, rest: afterType };
  }
  const named = takeName(afterType, grammar.name);
  return named === undefined
    ? undefined
    : { entry: { ...entry, name: named.name }, rest: named.rest };
}

function parseTag(segment: TaggedSegment): { tag?: JsdocTag; problems: JsdocProblem[] } {
  const grammar = GRAMMARS.get(segment.tag);
  if (grammar === undefined) {
    return {
      problems: [{ messageId: 'jsdocUnsupportedTag', data: { tag: segment.tag } }],
    };
  }
  const parsed = parseBody(grammar, segment.text);
  if (parsed === undefined) {
    return {
      problems: [{ messageId: 'jsdocMalformed', data: { tag: segment.tag, usage: grammar.usage } }],
    };
  }
  const tag: JsdocTag = { tag: segment.tag, ...parsed.entry };
  return parsed.rest === ''
    ? { tag, problems: typeProblems(tag) }
    : { tag, problems: [{ messageId: 'jsdocProse' }, ...typeProblems(tag)] };
}

function withoutStrings(type: string): string {
  return type.replace(STRING_LITERAL, '""');
}

function mentionsWord(type: string, word: string): boolean {
  return new RegExp(`(?<![\\w$.])${escapeRegExp(word)}(?![\\w$])(?!\\s*\\??:)`).test(
    withoutStrings(type),
  );
}

function mentionsAny(type: string): boolean {
  const text = withoutStrings(type);
  return mentionsWord(type, 'any') || STAR_TYPE.test(text) || BARE_NULLABLE.test(text);
}

function mentionsNull(type: string): boolean {
  const text = withoutStrings(type);
  return mentionsWord(type, 'null') || PREFIX_NULLABLE.test(text) || SUFFIX_NULLABLE.test(text);
}

function typeProblems(tag: JsdocTag): JsdocProblem[] {
  if (tag.type === undefined) {
    return [];
  }
  return [
    ...(mentionsAny(tag.type) ? [{ messageId: 'jsdocAnyType' }] : []),
    ...(mentionsNull(tag.type) ? [{ messageId: 'jsdocNullType' }] : []),
  ];
}

export function parseJsdoc(commentValue: string): ParsedJsdoc {
  const { leading, tagged } = segmentsOf(commentValue);
  const parsed = tagged.map(parseTag);
  const problems: JsdocProblem[] = [
    ...(leading.text.trim() === '' ? [] : [{ messageId: 'jsdocProse' }]),
    ...parsed.flatMap((result) => result.problems),
  ];
  const distinct = new Map(problems.map((problem) => [JSON.stringify(problem), problem]));
  return {
    tags: parsed.flatMap((result) => (result.tag === undefined ? [] : [result.tag])),
    problems: [...distinct.values()],
  };
}

export function castTags(tags: readonly JsdocTag[]): JsdocTag[] {
  return tags.filter((tag) => tag.tag === 'type' && tag.type !== 'const');
}

const UNKNOWN_WORD = /(?<![\w$.])unknown(?![\w$])(?!\s*\??:)/g;
const CAUGHT_ERROR_NAMES = new Set(['cause', 'error']);

function isCaughtErrorSlot(tag: JsdocTag): boolean {
  return tag.type === 'unknown' && tag.name !== undefined && CAUGHT_ERROR_NAMES.has(tag.name);
}

const MEMBER_TAGS = new Set(['param', 'property', 'prop']);
const OTHER_TYPE_TAGS = new Set(['returns', 'return', 'type', 'typedef', 'satisfies', 'this']);

function closedMemberRegion({
  opener,
  end,
  type,
}: {
  opener: Opener | undefined;
  end: number;
  type: string;
}): MemberRegion | undefined {
  const rest = type.slice(end + 1).trimStart();
  const isMemberList =
    opener?.character === '{' || (opener?.character === '(' && rest.startsWith('=>'));
  return isMemberList ? [opener.start, end] : undefined;
}

function memberRegions(type: string): MemberRegion[] {
  const regions: MemberRegion[] = [];
  const open: Opener[] = [];
  for (const [index, character] of Array.from(type).entries()) {
    if ('({'.includes(character)) {
      open.push({ character, start: index });
    }
    const region = ')}'.includes(character)
      ? closedMemberRegion({ opener: open.pop(), end: index, type })
      : undefined;
    if (region !== undefined) {
      regions.push(region);
    }
  }
  return regions;
}

function unknownInMemberPosition(type: string): boolean {
  const text = withoutStrings(type);
  const regions = memberRegions(text);
  return [...text.matchAll(UNKNOWN_WORD)].some(({ index }) =>
    regions.some(([start, end]) => index > start && index < end),
  );
}

function mentionsUnknownAsMember(tag: JsdocTag): boolean {
  if (tag.type === undefined) {
    return false;
  }
  if (MEMBER_TAGS.has(tag.tag)) {
    return mentionsWord(tag.type, 'unknown');
  }
  return OTHER_TYPE_TAGS.has(tag.tag) && unknownInMemberPosition(tag.type);
}

export function unknownMemberTags(tags: readonly JsdocTag[]): JsdocTag[] {
  return tags.filter((tag) => mentionsUnknownAsMember(tag) && !isCaughtErrorSlot(tag));
}

const TYPE_PREDICATE = /^(?:asserts\s+[\w$]+(?:\s+is\s.+)?|[\w$]+\s+is\s.+)$/s;

export function typePredicateTags(tags: readonly JsdocTag[]): JsdocTag[] {
  return tags.filter(
    (tag) => ['returns', 'return'].includes(tag.tag) && TYPE_PREDICATE.test(tag.type ?? ''),
  );
}

export function triStateBooleanTags(tags: readonly JsdocTag[]): JsdocTag[] {
  return tags.filter(
    (tag) => (MEMBER_TAGS.has(tag.tag) || OTHER_TYPE_TAGS.has(tag.tag)) && isTriStateTag(tag),
  );
}

export const jsdocOptionSchema: JSONSchema.JSONSchema4[] = [
  { type: 'object', properties: { jsdoc: { type: 'boolean' } }, additionalProperties: false },
];

function jsdocTagVisitor<Loc, MessageIds extends string>(
  context: JsdocContext<Loc, MessageIds>,
  selectTags: TagSelector,
  { messageId, data }: Pick<JsdocReport<MessageIds>, 'data' | 'messageId'>,
): { Program(): void } {
  return {
    Program() {
      for (const comment of context.sourceCode.getAllComments().filter(isJsdocBlock)) {
        if (selectTags(parseJsdoc(comment.value).tags).length > 0) {
          context.report({ loc: comment.loc, messageId, ...(data === undefined ? {} : { data }) });
        }
      }
    },
  };
}

export function withJsdoc<Loc, MessageIds extends string, Visitors extends object>(
  context: JsdocContext<Loc, MessageIds>,
  visitors: Visitors,
  { selectTags, messageId, data }: JsdocReport<MessageIds>,
): Visitors | (Visitors & { Program(): void }) {
  return fieldOf(context.options[0], 'jsdoc') === true
    ? { ...visitors, ...jsdocTagVisitor(context, selectTags, { messageId, data }) }
    : visitors;
}
