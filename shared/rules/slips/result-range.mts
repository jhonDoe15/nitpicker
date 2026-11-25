import { declaredTypes, isCollectionKind, kindOfType } from '../decided/models/types.mts';
import { nodesOf } from '../../near-duplicates/tree/nodes.mts';
import { chainOf } from '../../traversal.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';

type Language = 'kotlin' | 'java' | 'go' | 'python' | 'typescript';
type Types = ReadonlyMap<string, string>;
type Relation = { node: TreeNode; call: TreeNode; operator: string; number: number };
export type ResultRangeSlip = { node: TreeNode; subject: string; fix: string };

const COMPARE = 'compare';
const TYPESCRIPT = 'typescript';

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const ORDER = new Set(['<', '<=', '>', '>=']);
const FLIPPED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const SIGN_ONLY: Readonly<Record<string, ReadonlySet<string>>> = {
  kotlin: new Set(['compareTo', COMPARE, 'compareValues']),
  typescript: new Set(['localeCompare', COMPARE]),
};
const LOOKUPS = new Set(['get', 'at', 'charAt']);
const COMPARATOR_FUNCTION = /^\([^(),]*,[^()]*\)\s*=>\s*number$/u;
const COMPARATOR_NAME = /compar|cmp/iu;
const COMPARATORS = new Set(['Comparator', 'Collator']);
const FIRST_ELEMENT = new Set([
  'get',
  'at',
  'charAt',
  'getFirst',
  'first',
  'firstOrNull',
  'peekFirst',
]);
const SEARCHES: {
  readonly other: ReadonlySet<string>;
  readonly [language: string]: ReadonlySet<string>;
} = {
  python: new Set(['find', 'rfind']),
  go: new Set([
    'Index',
    'IndexByte',
    'IndexRune',
    'IndexAny',
    'IndexFunc',
    'LastIndex',
    'LastIndexByte',
    'LastIndexAny',
    'LastIndexFunc',
  ]),
  other: new Set(['indexOf', 'lastIndexOf']),
};
const GO_PACKAGES = new Set(['strings', 'bytes', 'slices']);
const NUMBER_SUFFIX = /[lLfFdD]$/u;
const ZERO_TESTS = new Set(['==', '===']);
const MISSES_FIRST = new Set(['> 0', '>= 1', '<= 0', '< 1']);

function languageOf(file: string): Language {
  if (file.endsWith('.kt')) {
    return 'kotlin';
  }
  if (file.endsWith('.java')) {
    return 'java';
  }
  if (file.endsWith('.go')) {
    return 'go';
  }
  return file.endsWith('.py') ? 'python' : TYPESCRIPT;
}

function isNegation(node: TreeNode): boolean {
  return node.kind === 'unary' && node.value === '-';
}

function numberOf(node: TreeNode): number | undefined {
  const chain = chainOf(node, (current: TreeNode) =>
    isNegation(current) ? current.children[0] : undefined,
  );
  const base = chain.at(-1);
  if (base === undefined || base.kind !== 'literal' || base.literal !== 'number') {
    return undefined;
  }
  const digits = String(base.value).replace(NUMBER_SUFFIX, '');
  const value = digits.trim() === '' ? Number.NaN : Number(digits);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return chain.length % 2 === 0 ? -value : value;
}

function calleeName(call: TreeNode): string {
  const [callee] = call.children;
  return callee?.kind === 'member' || callee?.kind === 'name'
    ? (callee.text ?? callee.value ?? '')
    : '';
}

function methodName(call: TreeNode): string {
  const name = calleeName(call);
  return name.slice(name.lastIndexOf('.') + 1);
}

function relationOf(node: TreeNode): Relation[] {
  const [left, right] = node.children;
  if (left === undefined || right === undefined) {
    return [];
  }
  const isCallLeft = left.kind === 'call';
  const call = isCallLeft ? left : right;
  const number = numberOf(isCallLeft ? right : left);
  if (call.kind !== 'call' || number === undefined) {
    return [];
  }
  const written = node.value ?? '';
  const operator = isCallLeft ? written : (FLIPPED.get(written) ?? written);
  return [{ node, call, operator, number }];
}

function comparisons(tree: TreeNode): Relation[] {
  return nodesOf(tree)
    .filter(
      (node) =>
        node.kind === 'binary' &&
        node.value !== undefined &&
        (EQUALITY.has(node.value) || ORDER.has(node.value)),
    )
    .flatMap((node) => relationOf(node));
}

function isSignOnlyMisuse({ operator, number }: Relation): boolean {
  if (number === 0) {
    return false;
  }
  if (EQUALITY.has(operator)) {
    return true;
  }
  return (
    (operator === '>' && number >= 1) ||
    (operator === '>=' && number >= 2) ||
    (operator === '<' && number <= -1) ||
    (operator === '<=' && -number >= 2)
  );
}

function receiverType(call: TreeNode, types: Types): string | undefined {
  const receiver = call.children[0]?.children[0];
  const type = receiver?.kind === 'name' ? types.get(receiver.value ?? '') : undefined;
  return type === undefined ? undefined : kindOfType(type);
}

function isTypedComparator(call: TreeNode, types: Types): boolean {
  const callee = call.children[0];
  const type = callee?.kind === 'name' ? types.get(callee.value ?? '') : undefined;
  return (
    type !== undefined &&
    COMPARATOR_FUNCTION.test(type) &&
    COMPARATOR_NAME.test(callee?.value ?? '')
  );
}

function isLibraryComparison(
  call: TreeNode,
  { language, types }: { language: Language; types: Types },
): boolean {
  const name = methodName(call);
  const isMember = call.children[0]?.kind === 'member';
  if (language === TYPESCRIPT && !isMember) {
    return isTypedComparator(call, types);
  }
  if (name === 'compareValues') {
    return true;
  }
  if (name === COMPARE) {
    return isMember && COMPARATORS.has(receiverType(call, types) ?? '');
  }
  return isMember;
}

function signOnlyFindings(
  found: readonly Relation[],
  { language, types }: { language: Language; types: Types },
): ResultRangeSlip[] {
  const names = SIGN_ONLY[language] ?? new Set();
  return found
    .filter(
      (entry) =>
        (names.has(methodName(entry.call)) ||
          (language === TYPESCRIPT && isTypedComparator(entry.call, types))) &&
        isSignOnlyMisuse(entry) &&
        isLibraryComparison(entry.call, { language, types }),
    )
    .map(({ node, call }) => ({
      node,
      subject: `\`${node.text ?? methodName(call)}\` compares a sign-only result with a value other than 0: \`${methodName(call)}\` may return any positive or negative number`,
      fix: 'Compare the result with 0 (`< 0`, `== 0`, `> 0`).',
    }));
}

function isKnownReceiver(call: TreeNode, language: Language, types: Types): boolean {
  if (language === 'go') {
    const owner = call.children[0]?.children[0];
    return owner?.kind === 'name' && GO_PACKAGES.has(owner.value ?? '');
  }
  return language !== 'java' || isCollectionKind(receiverType(call, types));
}

function isZero(node: TreeNode | undefined): boolean {
  return node?.kind === 'literal' && Number(node.value) === 0;
}

function isFirstIndex(node: TreeNode): boolean {
  if (node.kind === 'index') {
    return isZero(node.children[1]);
  }
  const [callee, first] = node.children;
  if (node.kind !== 'call' || callee?.kind !== 'member') {
    return false;
  }
  const isLookup = LOOKUPS.has(callee.value ?? '');
  return FIRST_ELEMENT.has(callee.value ?? '') && (isLookup ? isZero(first) : first === undefined);
}

function handlesFirst(tree: TreeNode, call: TreeNode): boolean {
  function same(node: TreeNode): boolean {
    return node.kind === 'call' && node.text === call.text;
  }
  return nodesOf(tree).some(
    (node) =>
      isFirstIndex(node) ||
      (node.kind === 'binary' &&
        ZERO_TESTS.has(node.value ?? '') &&
        node.children.some((child) => same(child)) &&
        node.children.some((child) => numberOf(child) === 0)),
  );
}

function searchFindings(
  found: readonly Relation[],
  { language, types, tree }: { language: Language; types: Types; tree: TreeNode },
): ResultRangeSlip[] {
  const names = SEARCHES[language] ?? SEARCHES.other;
  return found
    .filter(({ call, operator, number }) => {
      const form = `${operator} ${String(number)}`;
      return (
        names.has(methodName(call)) &&
        call.children[0]?.kind === 'member' &&
        MISSES_FIRST.has(form) &&
        isKnownReceiver(call, language, types) &&
        !handlesFirst(tree, call)
      );
    })
    .map(({ node, call }) => ({
      node,
      subject: `\`${node.text ?? methodName(call)}\` misses a match at position 0, because \`${methodName(call)}\` returns 0 for it and -1 for none`,
      fix: 'Test `>= 0` (or `!= -1`), or use a containment check (`contains`, `includes`, `in`).',
    }));
}

export function resultRangeSlips(tree: TreeNode, file: string): ResultRangeSlip[] {
  const language = languageOf(file);
  const found = comparisons(tree);
  const types = declaredTypes(tree);
  return [
    ...signOnlyFindings(found, { language, types }),
    ...searchFindings(found, { language, types, tree }),
  ];
}
