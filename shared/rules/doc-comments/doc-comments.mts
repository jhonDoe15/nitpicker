import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactDocComment } from '../facts/typed/fact-types.mts';
import { exceptionText } from '../exceptions.mts';

const STOPWORDS = new Set(
  `a an the this that of for to in on by with and or is are be it its get gets set sets return returns
  function method component hook class type value given new current specified provided`.split(
    /\s+/u,
  ),
);
const SUFFIXES = [
  ['ing', 'e'],
  ['ed', 'e'],
  ['es', ''],
  ['s', ''],
];
const MIN_STEM_LENGTH = 3;
const CODE_FENCE = /^(?:```|~~~)/u;
const EXAMPLE_TAG = /^@example(?![\w-])/u;
const BLOCK_TAG = /^@[A-Za-z][\w-]*(?=[\s{]|$)/u;
const INLINE_TAG = /\{@\w+\b\s*((?:[^\s}][^}]*)?)\}/gu;
const NAMED_TAGS = new Set([
  'param',
  'arg',
  'argument',
  'prop',
  'property',
  'template',
  'typeparam',
]);
const THROWS_TAGS = new Set(['throws', 'exception']);
const METADATA_TAGS = new Set([
  'author',
  'since',
  'version',
  'see',
  'serial',
  'serialfield',
  'serialdata',
]);
const NAME_WORD = /^(?:\[[^\]]*\]|\S+)/u;
const HAS_WORD = /\w/u;

const MAX_DESCRIPTION_LINES = 5;

export type DocCommentProblem =
  { kind: 'restating'; name: string } | { kind: 'long'; lines: number; limit: number };

type TagPatterns = { readonly blockTag: RegExp; readonly marker?: RegExp };
type Reading = { fenced: boolean; example: boolean; code: boolean };

function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/([A-Za-z])(\d)/gu, '$1 $2')
    .replace(/(\d)([A-Za-z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

function stemVariants(word: string): string[] {
  return SUFFIXES.filter(
    ([suffix = '']) => word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH,
  ).reduce(
    (variants: string[], [suffix = '', extra = '']) => {
      const stem = word.slice(0, -suffix.length);
      return [...variants, stem, ...(extra === '' ? [] : [stem + extra])];
    },
    [word],
  );
}

function pairedFences(lines: readonly string[]): Set<number> {
  const fences = lines.flatMap((line, index) => (CODE_FENCE.test(line.trim()) ? [index] : []));
  return new Set(fences.length % 2 === 0 ? fences : fences.slice(0, -1));
}

export function descriptionLines(text: string, { blockTag, marker = /^/u }: TagPatterns): string[] {
  const lines = text.split('\n').map((raw) => raw.replace(marker, '').trim());
  const fences = pairedFences(lines);
  const description: string[] = [];
  let insideFence = false;
  for (const [index, line] of lines.entries()) {
    if (fences.has(index)) {
      insideFence = !insideFence;
    }
    if (!insideFence && blockTag.test(line)) {
      break;
    }
    if (line !== '') {
      description.push(line);
    }
  }
  return description;
}

function afterType(text: string): string | undefined {
  if (!text.startsWith('{')) {
    return undefined;
  }
  let depth = 0;
  for (const [index, character] of Array.from(text).entries()) {
    depth += Number(character === '{') - Number(character === '}');
    if (depth === 0) {
      return text.slice(index + 1).trim();
    }
  }
  return '';
}

function tagContent(line: string, blockTag: RegExp): string {
  const [tag = ''] = blockTag.exec(line) ?? [];
  const name = tag.slice(1).toLowerCase();
  const rest = line.slice(tag.length).trim();
  const typed = afterType(rest);
  const named = NAMED_TAGS.has(name) || (THROWS_TAGS.has(name) && typed === undefined);
  const content = typed ?? rest;
  return named ? content.replace(NAME_WORD, '') : content;
}

function isMetadataTag(line: string, blockTag: RegExp): boolean {
  return METADATA_TAGS.has((blockTag.exec(line)?.[0] ?? '').slice(1).toLowerCase());
}

export function tagsHaveContent(text: string, { blockTag, marker = /^/u }: TagPatterns): boolean {
  const lines = text.split('\n').map((raw) => raw.replace(marker, '').trim());
  const fences = pairedFences(lines);
  let insideFence = false;
  let counted = false;
  for (const [index, line] of lines.entries()) {
    if (fences.has(index)) {
      insideFence = !insideFence;
    }
    const startsTag = !insideFence && blockTag.test(line);
    counted = startsTag ? !isMetadataTag(line, blockTag) : counted;
    if (counted && HAS_WORD.test(startsTag ? tagContent(line, blockTag) : line)) {
      return true;
    }
  }
  return false;
}

function withoutInlineTags(text: string): string {
  const end = text.lastIndexOf('}') + 1;
  return text.slice(0, end).replace(INLINE_TAG, ' $1 ') + text.slice(end);
}

function codeExampleState(state: Reading, raw: string, isFence: boolean): Reading {
  const line = raw.trim();
  if (isFence) {
    return { fenced: !state.fenced, example: state.example, code: true };
  }
  if (state.fenced) {
    return { ...state, code: true };
  }
  const tag = BLOCK_TAG.test(line);
  const example = EXAMPLE_TAG.test(line) || (state.example && !tag);
  return { fenced: false, example, code: example || tag };
}

function proseLines(lines: readonly string[]): string[] {
  const fences = pairedFences(lines);
  let state: Reading = { fenced: false, example: false, code: false };
  return lines.filter((line, index) => {
    state = codeExampleState(state, line, fences.has(index));
    return !state.code;
  });
}

function restatesName(lines: readonly string[], name: string): boolean {
  const description = wordsOf(withoutInlineTags(lines.join(' ')));
  const nameStems = new Set(wordsOf(name).flatMap(stemVariants));
  return (
    description.length > 0 &&
    description
      .filter((word) => !STOPWORDS.has(word))
      .every((word) => stemVariants(word).some((variant) => nameStems.has(variant)))
  );
}

export function docCommentProblem({
  name,
  lines,
  detailed = false,
}: {
  name: string | undefined;
  lines: readonly string[];
  detailed?: true | false;
}): DocCommentProblem | undefined {
  if (name !== undefined && !detailed && restatesName(lines, name)) {
    return { kind: 'restating', name };
  }
  const counted = proseLines(lines).length;
  return counted > MAX_DESCRIPTION_LINES
    ? { kind: 'long', lines: counted, limit: MAX_DESCRIPTION_LINES }
    : undefined;
}

function findingOf(
  comment: FactDocComment,
  problem: DocCommentProblem,
  analyzerName: string,
): Finding {
  const rule = RULE_IDS.docCommentContent;
  const restating = problem.kind === 'restating';
  return {
    tool: analyzerName,
    rule,
    path: comment.file,
    identity: `doc-comment:${comment.qualifier ?? comment.name}:${problem.kind}`,
    ...messageFields(restating ? MESSAGES.restatingDocComment : MESSAGES.longDocComment, {
      ...problem,
      exception: exceptionText(rule, comment.file),
    }),
    classification: 'enforceable',
    symbol: comment.name,
    location: { line: comment.line },
  };
}

export function docCommentFindings(
  docComments: readonly FactDocComment[],
  {
    analyzerName,
    isExcepted,
  }: { analyzerName: string; isExcepted: (rule: string, file: string) => boolean },
): Finding[] {
  return docComments
    .filter(({ file }) => !isExcepted(RULE_IDS.docCommentContent, file))
    .flatMap((comment) => {
      const problem = docCommentProblem(comment);
      return problem === undefined ? [] : [findingOf(comment, problem, analyzerName)];
    });
}
