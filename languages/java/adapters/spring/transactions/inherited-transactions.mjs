import path from 'node:path';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
  withoutGenerics,
} from '../../review-rules/java-sources.mjs';

const INHERITING_RULES = new Set([
  'SpringMultiWriteWithoutTransaction',
  'SpringDataWriteWithoutTransaction',
]);
const MAX_ANCESTORS = 16;
const HEADER = /(?<!\.)\b(?:class|interface)\s+(\w+)/gu;
const TRANSACTIONAL = /@(?:[\w.]*\.)?Transactional\b/u;
const PERMITS = /\bpermits\b[\s\S]*/u;
const SEPARATORS = /[\s,]+/u;
const KEYWORDS = new Set(['', 'extends', 'implements']);
const BRACES = { '{': 1, '}': -1 };
const PARENTHESES = { ')': 1, '(': -1 };
const BOUNDARIES = new Set([';', '{', '}']);

function closingBrace(text, open) {
  let depth = 0;
  for (const [step, character] of text.slice(open).split('').entries()) {
    depth += BRACES[character] ?? 0;
    if (depth === 0) {
      return open + step;
    }
  }
  return text.length;
}

function prefixOf(text, index) {
  let depth = 0;
  let start = index;
  for (const character of text.slice(0, index).split('').reverse()) {
    depth += PARENTHESES[character] ?? 0;
    if (depth === 0 && BOUNDARIES.has(character)) {
      break;
    }
    start -= 1;
  }
  return text.slice(start, index);
}

function supertypes(tail) {
  return withoutGenerics(tail)
    .replace(PERMITS, '')
    .split(SEPARATORS)
    .filter((word) => !KEYWORDS.has(word))
    .map((name) => name.split('.').at(-1));
}

function headers(text) {
  return [...text.matchAll(HEADER)].flatMap((match) => {
    const after = match.index + match[0].length;
    const open = text.indexOf('{', after);
    const semicolon = text.indexOf(';', after);
    if (open < 0 || (semicolon >= 0 && semicolon < open)) {
      return [];
    }
    return [
      {
        name: match[1],
        transactional: TRANSACTIONAL.test(prefixOf(text, match.index)),
        supers: supertypes(text.slice(after, open)),
        start: match.index,
        end: closingBrace(text, open),
      },
    ];
  });
}

function classIndex(projectRoot, roots) {
  const index = new Map();
  for (const root of new Set(roots)) {
    for (const file of sourceFilesUnder(pathInside(projectRoot, root), ['.java'])) {
      const name = path.basename(file, '.java');
      index.set(name, [...(index.get(name) ?? []), file]);
    }
  }
  return index;
}

function declarationsOf(index, local, name) {
  return [
    ...local,
    ...(index.get(name) ?? []).flatMap((file) => headers(readJavaSource(file) ?? '')),
  ].filter((header) => header.name === name);
}

function inheritsTransaction(index, local, supers) {
  const pending = [...supers];
  const seen = new Set();
  for (const name of pending) {
    if (seen.has(name) || seen.size >= MAX_ANCESTORS) {
      continue;
    }
    seen.add(name);
    const declarations = declarationsOf(index, local, name);
    if (declarations.some(({ transactional }) => transactional)) {
      return true;
    }
    pending.push(...declarations.flatMap(({ supers }) => supers));
  }
  return false;
}

export function withoutInheritedTransactions(findings, { projectRoot, roots }) {
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || !INHERITING_RULES.has(finding.rule)) {
      return true;
    }
    const text = readJavaSource(path.join(projectRoot, finding.path)) ?? '';
    const local = headers(text);
    const offset = offsetOf(text, { line: finding.location?.line ?? 1 });
    const owner = local.filter(({ start, end }) => start <= offset && offset <= end).at(-1);
    if (owner === undefined || owner.supers.length === 0) {
      return true;
    }
    index ??= classIndex(projectRoot, roots);
    return !inheritsTransaction(index, local, owner.supers);
  });
}
