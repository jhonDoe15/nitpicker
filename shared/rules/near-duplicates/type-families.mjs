import path from 'node:path';

const NO_TYPE = { kind: 'none', children: [] };
const SPECIALIZED_VERDICTS = new Set(['parameterizable', 'partial-run']);
const FAMILY_FILE = /\.(?:java|kts?|go)$/u;
const GENERIC_TYPE = /^(?:Object|any|[A-Z]\d?)(?:\[\])*(?:\.\.\.)?$/u;
const SEGMENT = /[A-Z]?[a-z]+\d*|[A-Z]+(?![a-z])\d*/gu;
const TYPE_WORDS = new Map([
  ['boolean', 'boolean'],
  ['byte', 'byte'],
  ['char', 'char'],
  ['character', 'char'],
  ['short', 'short'],
  ['int', 'int'],
  ['integer', 'int'],
  ['long', 'long'],
  ['float', 'float'],
  ['double', 'double'],
  ['int8', 'int8'],
  ['int16', 'int16'],
  ['int32', 'int32'],
  ['int64', 'int64'],
  ['uint', 'uint'],
  ['uint8', 'uint8'],
  ['uint16', 'uint16'],
  ['uint32', 'uint32'],
  ['uint64', 'uint64'],
  ['float32', 'float32'],
  ['float64', 'float64'],
  ['rune', 'rune'],
]);

function typeWordOf(segment) {
  const word = segment.toLowerCase();
  return TYPE_WORDS.get(word) ?? TYPE_WORDS.get(word.replace(/s$/u, ''));
}

function typeWords(text) {
  return new Set((text.match(SEGMENT) ?? []).map(typeWordOf).filter(Boolean));
}

function nodeText(node) {
  return node.value ?? node.text ?? '';
}

function isLeaf(node) {
  return node.kind === 'type' || node.children.length === 0;
}

function isSameWords(left, right) {
  return left.size === right.size && [...left].every((word) => right.has(word));
}

function isOwnFamilyReference(a, b) {
  return a.kind === 'name' && b.kind === 'name' && a.text !== undefined && a.text === b.text;
}

function isGenericType(node) {
  return node.kind === 'type' && GENERIC_TYPE.test(nodeText(node));
}

function isFamilyType(node, words) {
  return words.size > 0 || isGenericType(node);
}

function isTypeHole({ a, b }) {
  if (!(isLeaf(a) && isLeaf(b))) {
    return false;
  }
  const [left, right] = [a, b].map((node) => typeWords(nodeText(node)));
  const typed = isFamilyType(a, left) && isFamilyType(b, right);
  return (typed || isOwnFamilyReference(a, b)) && !isSameWords(left, right);
}

function isNumber(node) {
  const converted = node.kind === 'expression' && node.value === 'cast' ? node.children[1] : node;
  return converted?.kind === 'literal' && converted.literal === 'number';
}

function isSizeHole({ a, b }) {
  return isNumber(a) && isNumber(b);
}

function isTypeNamedSibling(left, right) {
  return (
    path.posix.dirname(left) === path.posix.dirname(right) &&
    [left, right].every((file) => typeWords(path.posix.basename(file)).size > 0)
  );
}

function signatureTypes({ tree }) {
  const [returned, parameters] = tree.children;
  return [returned, ...parameters.children.map((parameter) => parameter.children[0] ?? NO_TYPE)];
}

function hasFamilySignature(here, other) {
  const [left, right] = [here, other].map(signatureTypes);
  const pairs = left.map((a, index) => ({ a, b: right[index] ?? NO_TYPE }));
  const differing = pairs.filter(({ a, b }) => a.value !== b.value);
  return left.length === right.length && differing.length > 0 && differing.every(isTypeHole);
}

function isFamilyPair(finding, [here, other]) {
  const holes = finding.parameters ?? [];
  if (finding.verdict === 'partial-run' && holes.length === 0) {
    return hasFamilySignature(here, other);
  }
  return holes.some(isTypeHole) && holes.every((hole) => isTypeHole(hole) || isSizeHole(hole));
}

export function isTypeSpecialized(finding, [here, other]) {
  return (
    SPECIALIZED_VERDICTS.has(finding.verdict) &&
    [here.file, other.file].every((file) => FAMILY_FILE.test(file)) &&
    (here.file === other.file || isTypeNamedSibling(here.file, other.file)) &&
    isFamilyPair(finding, [here, other])
  );
}
