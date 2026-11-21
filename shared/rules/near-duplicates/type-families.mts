import path from 'node:path';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { NearFinding, NearHole, NearPair, NearSide } from './near-types.mts';

const NO_TYPE: TreeNode = { kind: 'none', children: [] };
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

function typeWordOf(segment: string): string | undefined {
  const word = segment.toLowerCase();
  return TYPE_WORDS.get(word) ?? TYPE_WORDS.get(word.replace(/s$/u, ''));
}

function typeWords(text: string): Set<string> {
  return new Set((text.match(SEGMENT) ?? []).map(typeWordOf).filter((word) => word !== undefined));
}

function nodeText(node: TreeNode): string {
  return node.value ?? node.text ?? '';
}

function isLeaf(node: TreeNode): boolean {
  return node.kind === 'type' || node.children.length === 0;
}

function isSameWords(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((word) => right.has(word));
}

function isOwnFamilyReference(a: TreeNode, b: TreeNode): boolean {
  return a.kind === 'name' && b.kind === 'name' && a.text !== undefined && a.text === b.text;
}

function isGenericType(node: TreeNode): boolean {
  return node.kind === 'type' && GENERIC_TYPE.test(nodeText(node));
}

function isFamilyType(node: TreeNode, words: ReadonlySet<string>): boolean {
  return words.size > 0 || isGenericType(node);
}

function isTypeHole({ a, b }: NearHole): boolean {
  if (!(isLeaf(a) && isLeaf(b))) {
    return false;
  }
  const left = typeWords(nodeText(a));
  const right = typeWords(nodeText(b));
  const typed = isFamilyType(a, left) && isFamilyType(b, right);
  return (typed || isOwnFamilyReference(a, b)) && !isSameWords(left, right);
}

function isNumber(node: TreeNode): boolean {
  const converted = node.kind === 'expression' && node.value === 'cast' ? node.children[1] : node;
  return converted?.kind === 'literal' && converted.literal === 'number';
}

function isSizeHole({ a, b }: NearHole): boolean {
  return isNumber(a) && isNumber(b);
}

function isTypeNamedSibling(left: string, right: string): boolean {
  return (
    path.posix.dirname(left) === path.posix.dirname(right) &&
    [left, right].every((file) => typeWords(path.posix.basename(file)).size > 0)
  );
}

function signatureTypes({ tree }: NearSide): TreeNode[] {
  const [returned, parameters] = tree.children;
  return [
    returned ?? NO_TYPE,
    ...(parameters?.children ?? []).map((parameter) => parameter.children[0] ?? NO_TYPE),
  ];
}

function hasFamilySignature(here: NearSide, other: NearSide): boolean {
  const left = signatureTypes(here);
  const right = signatureTypes(other);
  const pairs = left.map((a, index) => ({ a, b: right[index] ?? NO_TYPE }));
  const differing = pairs.filter(({ a, b }) => a.value !== b.value);
  return left.length === right.length && differing.length > 0 && differing.every(isTypeHole);
}

function isFamilyPair(finding: NearFinding, [here, other]: NearPair): boolean {
  const holes = finding.parameters ?? [];
  if (finding.verdict === 'partial-run' && holes.length === 0) {
    return hasFamilySignature(here, other);
  }
  return holes.some(isTypeHole) && holes.every((hole) => isTypeHole(hole) || isSizeHole(hole));
}

export function isTypeSpecialized(finding: NearFinding, [here, other]: NearPair): boolean {
  return (
    SPECIALIZED_VERDICTS.has(finding.verdict) &&
    [here.file, other.file].every((file) => FAMILY_FILE.test(file)) &&
    (here.file === other.file || isTypeNamedSibling(here.file, other.file)) &&
    isFamilyPair(finding, [here, other])
  );
}
