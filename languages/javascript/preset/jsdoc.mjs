export const SUPPORTED_TAGS = [
  'param',
  'returns',
  'return',
  'type',
  'typedef',
  'property',
  'prop',
  'template',
  'callback',
  'satisfies',
  'import',
  'overload',
  'this',
];

const NAME = /^(?:\[[^\]]*\]|[\w$.]+)/;
const NAME_LIST = /^[\w$]+(?:\s*,\s*[\w$]+)*/;
const IMPORT_FORM = /^(?:\{[^}]*\}|\*\s+as\s+[\w$]+)\s+from\s+(?:'[^']+'|"[^"]+")$/;
const STRING_LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;
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
    return { problems: [{ messageId: 'jsdocUnsupportedTag', data: { tag: segment.tag } }] };
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
  return mentionsWord(type, 'any') || /(?<![\w$.])\*(?![\w$.])/.test(withoutStrings(type));
}

function typeProblems(tag) {
  if (tag.type === undefined) {
    return [];
  }
  return [
    ...(mentionsAny(tag.type) ? [{ messageId: 'jsdocAnyType' }] : []),
    ...(mentionsWord(tag.type, 'null') ? [{ messageId: 'jsdocNullType' }] : []),
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

const CAUGHT_ERROR_NAMES = new Set(['cause', 'error']);

function isCaughtErrorSlot(tag) {
  return tag.type === 'unknown' && CAUGHT_ERROR_NAMES.has(tag.name);
}

function declaresMembers(tag) {
  return (
    ['param', 'property', 'prop'].includes(tag.tag) ||
    (tag.tag === 'typedef' && tag.type.startsWith('{'))
  );
}

export function unknownMemberTags(tags) {
  return tags.filter(
    (tag) => declaresMembers(tag) && mentionsWord(tag.type, 'unknown') && !isCaughtErrorSlot(tag),
  );
}

const TYPE_PREDICATE = /^(?:asserts\s+[\w$]+(?:\s+is\s+.+)?|[\w$]+\s+is\s+.+)$/s;

export function typePredicateTags(tags) {
  return tags.filter(
    (tag) => ['returns', 'return'].includes(tag.tag) && TYPE_PREDICATE.test(tag.type),
  );
}

export const jsdocOptionSchema = [
  { type: 'object', properties: { jsdoc: { type: 'boolean' } }, additionalProperties: false },
];

function jsdocTagVisitor(context, selectTags, messageId) {
  return {
    Program() {
      for (const comment of context.sourceCode.getAllComments().filter(isJsdocBlock)) {
        if (selectTags(parseJsdoc(comment.value).tags).length > 0) {
          context.report({ loc: comment.loc, messageId });
        }
      }
    },
  };
}

export function withJsdoc(context, visitors, { selectTags, messageId }) {
  return context.options[0]?.jsdoc === true
    ? { ...visitors, ...jsdocTagVisitor(context, selectTags, messageId) }
    : visitors;
}
