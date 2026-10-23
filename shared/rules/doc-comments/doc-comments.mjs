import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

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
const INLINE_TAG = /\{@\w+(?!\w)\s*((?:[^\s}][^}]*)?)\}/gu;

const MAX_DESCRIPTION_LINES = 5;

function wordsOf(text) {
  return text
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/([A-Za-z])(\d)/gu, '$1 $2')
    .replace(/(\d)([A-Za-z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

function stemVariants(word) {
  return SUFFIXES.filter(
    ([suffix]) => word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH,
  ).reduce(
    (variants, [suffix, extra]) => {
      const stem = word.slice(0, -suffix.length);
      return [...variants, stem, ...(extra === '' ? [] : [stem + extra])];
    },
    [word],
  );
}

function pairedFences(lines) {
  const fences = lines.flatMap((line, index) => (CODE_FENCE.test(line.trim()) ? [index] : []));
  return new Set(fences.length % 2 === 0 ? fences : fences.slice(0, -1));
}

export function descriptionLines(text, { blockTag, marker = /^/u }) {
  const lines = text.split('\n').map((raw) => raw.replace(marker, '').trim());
  const fences = pairedFences(lines);
  const description = [];
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

function withoutInlineTags(text) {
  const end = text.lastIndexOf('}') + 1;
  return text.slice(0, end).replace(INLINE_TAG, ' $1 ') + text.slice(end);
}

function codeExampleState(state, raw, isFence) {
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

function proseLines(lines) {
  const fences = pairedFences(lines);
  let state = { fenced: false, example: false, code: false };
  return lines.filter((line, index) => {
    state = codeExampleState(state, line, fences.has(index));
    return !state.code;
  });
}

function restatesName(lines, name) {
  const description = wordsOf(withoutInlineTags(lines.join(' ')));
  const nameStems = new Set(wordsOf(name).flatMap(stemVariants));
  return (
    description.length > 0 &&
    description
      .filter((word) => !STOPWORDS.has(word))
      .every((word) => stemVariants(word).some((variant) => nameStems.has(variant)))
  );
}

export function docCommentProblem({ name, lines }) {
  if (name !== undefined && restatesName(lines, name)) {
    return { kind: 'restating', name };
  }
  const counted = proseLines(lines).length;
  return counted > MAX_DESCRIPTION_LINES
    ? { kind: 'long', lines: counted, limit: MAX_DESCRIPTION_LINES }
    : undefined;
}

function findingOf(comment, problem, analyzerName) {
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

export function docCommentFindings(docComments, { analyzerName, isExcepted }) {
  return docComments
    .filter(({ file }) => !isExcepted(RULE_IDS.docCommentContent, file))
    .flatMap((comment) => {
      const problem = docCommentProblem(comment);
      return problem === undefined ? [] : [findingOf(comment, problem, analyzerName)];
    });
}
