import path from 'node:path';

const NAMED_SOURCES = /\.(java|kt|groovy|scala|py)$/u;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const QUALIFIED_TOKEN = /(?<![\w$./])[A-Za-z_$][\w$]*(?:[./][A-Za-z_$][\w$]*)+/gu;
const DESCRIPTOR_PREFIX = /^[BCDFIJSZ]*L/u;
const PYTHON_PACKAGE = '__init__';
const KOTLIN_FACADE = 'Kt';
const AMBIGUOUS = Symbol('ambiguous');
const PLACEHOLDER = '_';

export function qualifiedNameMoves(renames, { skip = new Set() } = {}) {
  const pairs = [...renames]
    .filter(([oldPath]) => !skip.has(oldPath))
    .flatMap(([oldPath, newPath]) => namePairs(oldPath, newPath));
  return new Map([...agreedPairs(pairs)].filter(([from]) => from.includes('.')));
}

export function bareFileMoves(renames, { skip = new Set(), packageDirs = new Set() } = {}) {
  const own = [...renames]
    .filter(([oldPath]) => !skip.has(oldPath))
    .map(([oldPath, newPath]) => [
      oldPath,
      namePairs(oldPath, newPath, { withFacades: false, packageDirs }).find(
        ([from]) => !from.includes('.'),
      ),
    ])
    .filter(([, pair]) => pair !== undefined && !pair[0].includes('.'));
  return new Map(own);
}

export function agreedPairs(pairs) {
  const moves = new Map();
  for (const [from, to] of pairs) {
    const known = moves.get(from);
    moves.set(from, known === undefined || known === to ? to : AMBIGUOUS);
  }
  return new Map([...moves].filter(([, to]) => to !== AMBIGUOUS));
}

export function packageMoves(oldPath, newPath) {
  if (newPath === undefined) {
    return new Map();
  }
  const packages = namePairs(oldPath, newPath, { withFacades: false })
    .map(([from, to]) => [packageOf(from), packageOf(to)])
    .filter(([from, to]) => from !== undefined && to !== undefined && from !== to);
  return new Map(packages);
}

function packageOf(name) {
  const end = name.lastIndexOf('.');
  return end === -1 ? undefined : name.slice(0, end);
}

function namePairs(oldPath, newPath, { withFacades = true, packageDirs = new Set() } = {}) {
  const oldExtension = NAMED_SOURCES.exec(oldPath)?.[1];
  if (oldExtension === undefined || oldExtension !== NAMED_SOURCES.exec(newPath)?.[1]) {
    return [];
  }
  const from = nameSegments(oldPath, oldExtension);
  const to = nameSegments(newPath, oldExtension);
  const pairs =
    from.length === 1
      ? topLevelPairs({ name: from[0], to, packageDirs, extension: oldExtension, newPath })
      : Array.from({ length: from.length - 1 }, (_, index) =>
          pairAt(from, to, from.length - index),
        ).filter((pair) => pair !== undefined && pair[0] !== pair[1]);
  return withFacades && oldExtension === 'kt'
    ? [...pairs, ...pairs.map(([left, right]) => [left + KOTLIN_FACADE, right + KOTLIN_FACADE])]
    : pairs;
}

export function directoryNamePairs(oldDirectory, newDirectory) {
  const from = [...oldDirectory.split('/'), PLACEHOLDER];
  const to = [...newDirectory.split('/'), PLACEHOLDER];
  return Array.from({ length: from.length - 1 }, (_, index) =>
    pairAt(from, to, from.length - index),
  )
    .filter((pair) => pair !== undefined && pair[0] !== pair[1])
    .map(([left, right]) => [
      left.slice(0, -PLACEHOLDER.length - 1),
      right.slice(0, -PLACEHOLDER.length - 1),
    ]);
}

function nameSegments(filePath, extension) {
  const segments = filePath.slice(0, -extension.length - 1).split('/');
  return extension === 'py' && segments.at(-1) === PYTHON_PACKAGE
    ? segments.slice(0, -1)
    : segments;
}

function topLevelPairs({ name, to, packageDirs, extension, newPath }) {
  const isPackage = path.posix.basename(newPath) === `${PYTHON_PACKAGE}.py`;
  const checked = to.slice(0, isPackage ? to.length : to.length - 1);
  const dirs = checked.map((_, index) => to.slice(0, index + 1).join('/'));
  const start = dirs.length === 0 ? 0 : dirs.findIndex((directory) => packageDirs.has(directory));
  const rest = to.slice(start);
  const valid =
    extension === 'py' &&
    start !== -1 &&
    dirs.slice(start).every((directory) => packageDirs.has(directory)) &&
    rest.every((segment) => IDENTIFIER.test(segment)) &&
    !(rest.length === 1 && rest[0] === name);
  return valid ? [[name, rest.join('.')]] : [];
}

function pairAt(from, to, nameLength) {
  const oldRoot = from.slice(0, from.length - nameLength);
  const newRootLength = matchingRootLength(oldRoot, to, from.at(-nameLength));
  if (newRootLength === undefined) {
    return undefined;
  }
  const oldName = from.slice(-nameLength);
  const newName = to.slice(newRootLength);
  return [...oldName, ...newName].every((segment) => IDENTIFIER.test(segment))
    ? [oldName.join('.'), newName.join('.')]
    : undefined;
}

function matchingRootLength(oldRoot, to, firstName) {
  const lengths = Array.from({ length: to.length }, (_, length) => length);
  if (oldRoot.length === 0) {
    const keepsTopName = lengths.filter((length) => to[length] === firstName);
    return keepsTopName.length === 1 ? keepsTopName[0] : 0;
  }
  const scored = lengths.map((length) => ({
    length,
    shared: sharedTail(oldRoot, to.slice(0, length)),
  }));
  const best = Math.max(...scored.map(({ shared }) => shared));
  if (best === 0) {
    return sharedHead(oldRoot, to) > 0 && oldRoot.length < to.length ? oldRoot.length : undefined;
  }
  const winners = scored.filter(({ shared }) => shared === best);
  return winners.length === 1 ? winners[0].length : undefined;
}

function sharedTail(left, right) {
  return sharedHead(left.toReversed(), right.toReversed());
}

function sharedHead(left, right) {
  const mismatch = left.findIndex((segment, index) => segment !== right[index]);
  return mismatch === -1 ? left.length : mismatch;
}

export function remapQualifiedNames(text, moves, packages = new Map()) {
  if ((moves.size === 0 && packages.size === 0) || typeof text !== 'string') {
    return text;
  }
  const subjectAt = text.search(QUALIFIED_TOKEN);
  return text.replace(
    QUALIFIED_TOKEN,
    (token, offset) =>
      remapToken(token, moves) ??
      (offset === subjectAt ? remapPackage(token, packages) : undefined) ??
      token,
  );
}

function remapToken(token, moves) {
  const descriptor = token.includes('/') ? (DESCRIPTOR_PREFIX.exec(token)?.[0] ?? '') : '';
  const remapped = remapPrefix(token, moves);
  if (remapped !== undefined || descriptor === '') {
    return remapped;
  }
  const inner = remapPrefix(token.slice(descriptor.length), moves);
  return inner === undefined ? undefined : descriptor + inner;
}

function remapPackage(token, packages) {
  const separator = separatorOf(token);
  return remapPrefix(
    token,
    packages,
    boundaries(token).filter((end) => token[end] === separator),
  );
}

function separatorOf(token) {
  return token.includes('/') ? '/' : '.';
}

function boundaries(token) {
  return [...token.matchAll(/[./$]/gu)].map(({ index }) => index);
}

function remapPrefix(token, moves, ends = [token.length, ...boundaries(token)]) {
  const separator = separatorOf(token);
  const other = separator === '/' ? '.' : '/';
  const found = ends
    .toSorted((left, right) => right - left)
    .map((end) => ({ end, key: token.slice(0, end) }))
    .filter(({ key }) => !key.includes('$') && !key.includes(other))
    .find(({ key }) => moves.has(key.replaceAll('/', '.')));
  return found === undefined
    ? undefined
    : moves.get(found.key.replaceAll('/', '.')).replaceAll('.', separator) + token.slice(found.end);
}

const BARE_SUBJECT = /^((?:[\w-]+:)*)([A-Za-z_$][\w$]*)(?=[#$]|$)/u;
const NAMING_PREFIX = /(?:^|:)(?:class|test|module-cycle):$/u;
const SYMBOL_PREFIX = /^(?:cov:)?$/u;
const BARE_DESCRIPTOR = /(?<=[(;[BCDFIJSZ)])L([A-Za-z_$][\w$]*);/gu;

function remapSubject(text, bare) {
  const match = BARE_SUBJECT.exec(text);
  if (match === null) {
    return text;
  }
  const [whole, prefix, name] = match;
  const named =
    NAMING_PREFIX.test(prefix) || (whole.length < text.length && SYMBOL_PREFIX.test(prefix));
  return bare.has(name) && named ? `${prefix}${bare.get(name)}${text.slice(whole.length)}` : text;
}

export function remapBareNames(text, bare) {
  if (bare.size === 0 || typeof text !== 'string') {
    return text;
  }
  const subject = remapSubject(text, bare);
  return subject.includes('(')
    ? subject.replace(BARE_DESCRIPTOR, (whole, name) =>
        bare.has(name) ? `L${bare.get(name).replaceAll('.', '/')};` : whole,
      )
    : subject;
}
