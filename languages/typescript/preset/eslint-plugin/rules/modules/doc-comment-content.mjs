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
const MAX_DESCRIPTION_LINES = 5;
const MEMBER_TYPES = new Set(['TSPropertySignature', 'TSMethodSignature']);

function keyName(key) {
  if (key?.type === 'Identifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}

function declaredName(node) {
  if (MEMBER_TYPES.has(node.type)) return keyName(node.key);
  const { declaration } = node;
  if (declaration?.type !== 'VariableDeclaration') return declaration?.id?.name;
  const [declarator] = declaration.declarations;
  return declaration.declarations.length === 1 && declarator.id.type === 'Identifier'
    ? declarator.id.name
    : undefined;
}

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

const BLOCK_TAG = /^@[A-Za-z][\w-]*(?=[\s{]|$)/u;
const CODE_FENCE = /^(?:```|~~~)/u;

function descriptionLines(commentValue) {
  const description = [];
  let insideFence = false;
  for (const raw of commentValue.split('\n')) {
    const line = raw.replace(/^\s*\*+/u, '').trim();
    if (CODE_FENCE.test(line)) insideFence = !insideFence;
    if (!insideFence && BLOCK_TAG.test(line)) break;
    if (line !== '') description.push(line);
  }
  return description;
}

function descriptionOf(commentValue) {
  return descriptionLines(commentValue)
    .join(' ')
    .replace(/\{@\w+\s*([^}]*)\}/gu, ' $1 ');
}

function restatesName(commentValue, name) {
  const description = wordsOf(descriptionOf(commentValue));
  const nameStems = new Set(wordsOf(name).flatMap(stemVariants));
  return (
    description.length > 0 &&
    description
      .filter((word) => !STOPWORDS.has(word))
      .every((word) => stemVariants(word).some((variant) => nameStems.has(variant)))
  );
}

export function docCommentContentReports(comment, node) {
  const name = declaredName(node);
  if (name !== undefined && restatesName(comment.value, name)) {
    return [{ messageId: 'restatingDocComment', data: { name } }];
  }
  const lines = descriptionLines(comment.value).length;
  return lines > MAX_DESCRIPTION_LINES
    ? [{ messageId: 'longDocComment', data: { lines, limit: MAX_DESCRIPTION_LINES } }]
    : [];
}
