const NAMED_SOURCES = /\.(java|kt|groovy|scala|py)$/u;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const QUALIFIED_TOKEN = /(?<![\w$./])[A-Za-z_$][\w$]*(?:[./][A-Za-z_$][\w$]*)+/gu;
const PYTHON_PACKAGE = '__init__';
const KOTLIN_FACADE = 'Kt';
const DESCRIPTOR_PREFIX = 'L';
const AMBIGUOUS = Symbol('ambiguous');

export function qualifiedNameMoves(renames) {
  const moves = new Map();
  for (const [oldPath, newPath] of renames) {
    for (const [from, to] of namePairs(oldPath, newPath)) {
      const known = moves.get(from);
      moves.set(from, known === undefined || known === to ? to : AMBIGUOUS);
    }
  }
  return new Map([...moves].filter(([, to]) => to !== AMBIGUOUS));
}

function namePairs(oldPath, newPath) {
  const oldExtension = NAMED_SOURCES.exec(oldPath)?.[1];
  if (oldExtension === undefined || oldExtension !== NAMED_SOURCES.exec(newPath)?.[1]) {
    return [];
  }
  const from = nameSegments(oldPath, oldExtension);
  const to = nameSegments(newPath, oldExtension);
  const pairs = Array.from({ length: from.length - 1 }, (_, index) =>
    pairAt(from, to, from.length - index),
  ).filter((pair) => pair !== undefined && pair[0] !== pair[1]);
  return oldExtension === 'kt'
    ? [...pairs, ...pairs.map(([left, right]) => [left + KOTLIN_FACADE, right + KOTLIN_FACADE])]
    : pairs;
}

function nameSegments(filePath, extension) {
  const segments = filePath.slice(0, -extension.length - 1).split('/');
  return extension === 'py' && segments.at(-1) === PYTHON_PACKAGE
    ? segments.slice(0, -1)
    : segments;
}

function pairAt(from, to, nameLength) {
  const oldRoot = from.slice(0, from.length - nameLength);
  const newRootLength = matchingRootLength(oldRoot, to);
  if (newRootLength === undefined) {
    return undefined;
  }
  const oldName = from.slice(-nameLength);
  const newName = to.slice(newRootLength);
  return [...oldName, ...newName].every((segment) => IDENTIFIER.test(segment))
    ? [oldName.join('.'), newName.join('.')]
    : undefined;
}

function matchingRootLength(oldRoot, to) {
  if (oldRoot.length === 0) {
    return 0;
  }
  const scored = Array.from({ length: to.length }, (_, length) => ({
    length,
    shared: sharedTail(oldRoot, to.slice(0, length)),
  })).filter(({ shared }) => shared > 0);
  const best = Math.max(0, ...scored.map(({ shared }) => shared));
  const winners = scored.filter(({ shared }) => shared === best);
  return winners.length === 1 ? winners[0].length : undefined;
}

function sharedTail(left, right) {
  const reversedRight = right.toReversed();
  const mismatch = left
    .toReversed()
    .findIndex((segment, index) => segment !== reversedRight[index]);
  return mismatch === -1 ? left.length : mismatch;
}

export function remapQualifiedNames(text, moves) {
  if (moves.size === 0 || typeof text !== 'string') {
    return text;
  }
  return text.replace(QUALIFIED_TOKEN, (token) => remapToken(token, moves));
}

function remapToken(token, moves) {
  const remapped = remapPrefix(token, moves);
  if (remapped !== undefined || !token.startsWith(DESCRIPTOR_PREFIX) || !token.includes('/')) {
    return remapped ?? token;
  }
  const inner = remapPrefix(token.slice(DESCRIPTOR_PREFIX.length), moves);
  return inner === undefined ? token : DESCRIPTOR_PREFIX + inner;
}

function remapPrefix(token, moves) {
  const separator = token.includes('/') ? '/' : '.';
  const ends = [...token.matchAll(/[./$]/gu)].map(({ index }) => index);
  for (const end of [token.length, ...ends.toReversed()]) {
    const prefix = token.slice(0, end);
    if (prefix.includes('$') || prefix.includes(separator === '/' ? '.' : '/')) {
      continue;
    }
    const target = moves.get(prefix.replaceAll('/', '.'));
    if (target !== undefined) {
      return target.replaceAll('.', separator) + token.slice(end);
    }
  }
  return undefined;
}
