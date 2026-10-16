import { MESSAGES, RULE_IDS, renderMessage } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const STOPWORDS = new Set(
  `a an the this that of for to in on by with and or is are be it its get gets set sets return returns
  function method component hook type value given new current specified provided`.split(/\s+/u),
);
const SUFFIXES = [
  ['ing', 'e'],
  ['ed', 'e'],
  ['es', ''],
  ['s', ''],
];
const MIN_STEM_LENGTH = 3;
const CODE_FENCE = /^(?:```|~~~)/u;
const INLINE_TAG = /\{@\w+\s*([^}]*)\}/gu;

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

export function descriptionLines(text, { blockTag, marker = /^/u }) {
  const description = [];
  let insideFence = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(marker, '').trim();
    if (CODE_FENCE.test(line)) insideFence = !insideFence;
    if (!insideFence && blockTag.test(line)) break;
    if (line !== '') description.push(line);
  }
  return description;
}

function restatesName(lines, name) {
  const description = wordsOf(lines.join(' ').replace(INLINE_TAG, ' $1 '));
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
  return lines.length > MAX_DESCRIPTION_LINES
    ? { kind: 'long', lines: lines.length, limit: MAX_DESCRIPTION_LINES }
    : undefined;
}

function findingOf(comment, problem, analyzerName) {
  const rule = RULE_IDS.docCommentContent;
  const restating = problem.kind === 'restating';
  return {
    tool: analyzerName,
    rule,
    path: comment.file,
    identity: `doc-comment:${comment.name}:${problem.kind}`,
    message: renderMessage(restating ? MESSAGES.restatingDocComment : MESSAGES.longDocComment, {
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
