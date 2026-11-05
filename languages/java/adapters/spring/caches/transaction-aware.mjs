import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mjs';

export const SPRING_CACHE_RULE = 'SpringCacheWriteInTransaction';
const TRANSACTION_AWARE = new RegExp(
  [
    String.raw`\bTransactionAware(?:CacheManagerProxy|CacheDecorator)\b`,
    String.raw`\.transactionAware\(\s*\)`,
    String.raw`\bsetTransactionAware\(\s*true\s*\)`,
    String.raw`\bisTransactionAware\s*=\s*true\b`,
  ].join('|'),
  'u',
);
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
const known = new Map();

export function configuresTransactionAwareCaches(projectRoot, roots) {
  const key = [projectRoot, ...roots].join('\0');
  if (!known.has(key)) {
    known.set(
      key,
      [...new Set(roots)]
        .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java', '.kt']))
        .some((file) =>
          TRANSACTION_AWARE.test(readFileSync(file, 'utf8').replaceAll(COMMENTS, '')),
        ),
    );
  }
  return known.get(key);
}

export function withoutTransactionAwareCacheWrites(findings, { projectRoot, roots }) {
  return findings.some(({ rule }) => rule === SPRING_CACHE_RULE) &&
    configuresTransactionAwareCaches(projectRoot, roots)
    ? findings.filter(({ rule }) => rule !== SPRING_CACHE_RULE)
    : findings;
}
