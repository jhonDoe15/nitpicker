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

const GRAMMARS = {
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
};

export function isJsdocBlock(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*');
}

function segmentsOf(commentValue) {
  const segments = [{ tag: undefined, text: '' }];
  for (const line of commentValue.split('\n')) {
    const cleaned = line.replace(COMMENT_PREFIX, '');
    const tag = TAG_LINE.exec(cleaned)?.[1];
    if (tag === undefined) {
      segments.at(-1).text += `${cleaned}\n`;
    } else {
      segments.push({ tag, text: `${cleaned.replace(TAG_LINE, '')}\n` });
    }
  }
  return segments;
}

function takeType(text) {
  if (!text.startsWith('{')) {
    return undefined;
  }
  let depth = 0;
  for (const [index, character] of text.split('').entries()) {
    depth += { '{': 1, '}': -1 }[character] ?? 0;
    if (depth === 0) {
      return { type: text.slice(1, index).trim(), rest: text.slice(index + 1).trim() };
    }
  }
  return undefined;
}

function takeName(text, pattern) {
  const matched = pattern.exec(text);
  return matched === null
    ? undefined
    : { name: matched[0].trim(), rest: text.slice(matched[0].length).trim() };
}

function parseBody(grammar, body) {
  const text = body.trim();
  if (grammar.whole !== undefined) {
    return grammar.whole.test(text) ? { entry: {}, rest: '' } : undefined;
  }
  const typed = takeType(text);
  if (typed === undefined && grammar.type === 'required') {
    return undefined;
  }
  const entry = typed === undefined ? {} : { type: typed.type };
  const afterType = typed === undefined ? text : typed.rest;
  if (grammar.name === undefined) {
    return { entry, rest: afterType };
  }
  const named = takeName(afterType, grammar.name);
  return named === undefined
    ? undefined
    : { entry: { ...entry, name: named.name }, rest: named.rest };
}

function parseTag(segment) {
  const grammar = GRAMMARS[segment.tag];
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
  const tag = { tag: segment.tag, ...parsed.entry };
  return parsed.rest === ''
    ? { tag, problems: typeProblems(tag) }
    : { tag, problems: [{ messageId: 'jsdocProse' }, ...typeProblems(tag)] };
}

function withoutStrings(type) {
  return type.replace(STRING_LITERAL, '""');
}

function mentionsWord(type, word) {
  return new RegExp(`(?<![\\w$.])${word}(?![\\w$])(?!\\s*\\??:)`).test(withoutStrings(type));
}

function mentionsAny(type) {
  const text = withoutStrings(type);
  return mentionsWord(type, 'any') || STAR_TYPE.test(text) || BARE_NULLABLE.test(text);
}

function mentionsNull(type) {
  const text = withoutStrings(type);
  return mentionsWord(type, 'null') || PREFIX_NULLABLE.test(text) || SUFFIX_NULLABLE.test(text);
}

function typeProblems(tag) {
  if (tag.type === undefined) {
    return [];
  }
  return [
    ...(mentionsAny(tag.type) ? [{ messageId: 'jsdocAnyType' }] : []),
    ...(mentionsNull(tag.type) ? [{ messageId: 'jsdocNullType' }] : []),
  ];
}

export function parseJsdoc(commentValue) {
  const [leading, ...tagged] = segmentsOf(commentValue);
  const parsed = tagged.map(parseTag);
  const problems = [
    ...(leading.text.trim() === '' ? [] : [{ messageId: 'jsdocProse' }]),
    ...parsed.flatMap((result) => result.problems),
  ];
  const distinct = new Map(problems.map((problem) => [JSON.stringify(problem), problem]));
  return {
    tags: parsed.flatMap((result) => (result.tag === undefined ? [] : [result.tag])),
    problems: [...distinct.values()],
  };
}

export function castTags(tags) {
  return tags.filter((tag) => tag.tag === 'type' && tag.type !== 'const');
}

const UNKNOWN_WORD = /(?<![\w$.])unknown(?![\w$])(?!\s*\??:)/g;
const CAUGHT_ERROR_NAMES = new Set(['cause', 'error']);

function isCaughtErrorSlot(tag) {
  return tag.type === 'unknown' && CAUGHT_ERROR_NAMES.has(tag.name);
}

const MEMBER_TAGS = new Set(['param', 'property', 'prop']);
const OTHER_TYPE_TAGS = new Set(['returns', 'return', 'type', 'typedef', 'satisfies', 'this']);

function closedMemberRegion({ opener, end, type }) {
  const rest = type.slice(end + 1).trimStart();
  const isMemberList =
    opener?.character === '{' || (opener?.character === '(' && rest.startsWith('=>'));
  return isMemberList ? [opener.start, end] : undefined;
}

function memberRegions(type) {
  const regions = [];
  const open = [];
  for (const [index, character] of [...type].entries()) {
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

function unknownInMemberPosition(type) {
  const text = withoutStrings(type);
  const regions = memberRegions(text);
  return [...text.matchAll(UNKNOWN_WORD)].some(({ index }) =>
    regions.some(([start, end]) => index > start && index < end),
  );
}

function mentionsUnknownAsMember(tag) {
  if (MEMBER_TAGS.has(tag.tag)) {
    return mentionsWord(tag.type, 'unknown');
  }
  return OTHER_TYPE_TAGS.has(tag.tag) && unknownInMemberPosition(tag.type);
}

export function unknownMemberTags(tags) {
  return tags.filter((tag) => mentionsUnknownAsMember(tag) && !isCaughtErrorSlot(tag));
}

const TYPE_PREDICATE = /^(?:asserts\s+[\w$]+(?:\s+is\s+.+)?|[\w$]+\s+is\s+.+)$/s;

export function typePredicateTags(tags) {
  return tags.filter(
    (tag) => ['returns', 'return'].includes(tag.tag) && TYPE_PREDICATE.test(tag.type),
  );
}

const TRI_STATE_TYPE =
  /^(?:Promise<\s*)?(?:\?\s*boolean|boolean\s*\|\s*(?:undefined|null)|(?:undefined|null)\s*\|\s*boolean|boolean=)\s*>?$/;
const BARE_NAME = /^\[[\w$]+\]$/;

function isTriStateTag(tag) {
  if (tag.type === undefined) {
    return false;
  }
  const optionalParameter = tag.tag === 'param' && BARE_NAME.test(tag.name ?? '');
  return TRI_STATE_TYPE.test(tag.type) || (optionalParameter && tag.type === 'boolean');
}

export function triStateBooleanTags(tags) {
  return tags.filter(
    (tag) => (MEMBER_TAGS.has(tag.tag) || OTHER_TYPE_TAGS.has(tag.tag)) && isTriStateTag(tag),
  );
}

export const jsdocOptionSchema = [
  { type: 'object', properties: { jsdoc: { type: 'boolean' } }, additionalProperties: false },
];

function jsdocTagVisitor(context, selectTags, { messageId, data }) {
  return {
    Program() {
      for (const comment of context.sourceCode.getAllComments().filter(isJsdocBlock)) {
        if (selectTags(parseJsdoc(comment.value).tags).length > 0) {
          context.report({ loc: comment.loc, messageId, data });
        }
      }
    },
  };
}

export function withJsdoc(context, visitors, { selectTags, messageId, data }) {
  return context.options[0]?.jsdoc === true
    ? { ...visitors, ...jsdocTagVisitor(context, selectTags, { messageId, data }) }
    : visitors;
}
