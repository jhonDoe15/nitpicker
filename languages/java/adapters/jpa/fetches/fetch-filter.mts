import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../../shared/filesystem.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { JpaFilterOptions } from '../jpa-types.mts';
import type { FetchSource } from './fetch-types.mts';
import { collectionFetchAt, crossedFetchAt, fetchSource } from './java/fetch-sites.mts';
import { javaEntities } from './java/java-entities.mts';

export const COLLECTION_FETCH_RULE = 'JpaMultipleCollectionFetch';
export const PAGED_FETCH_RULE = 'SpringPagedCollectionFetch';
const FETCH_RULES = new Set([COLLECTION_FETCH_RULE, PAGED_FETCH_RULE]);

function isCandidate(finding: JavaFinding): boolean {
  return finding.tool === 'pmd' && FETCH_RULES.has(finding.rule) && finding.path.endsWith('.java');
}

function sourceFile(projectRoot: string, relative: string): string | undefined {
  const file = pathInside(projectRoot, relative);
  return file !== undefined && existsSync(file) ? file : undefined;
}

export function withCrossedFetches(
  findings: readonly JavaFinding[],
  { projectRoot, sourceRoots = [] }: JpaFilterOptions,
): JavaFinding[] {
  let entities: ReturnType<typeof javaEntities> | undefined;
  const sources = new Map<string, FetchSource>();
  return findings.filter((finding) => {
    const file = isCandidate(finding) ? sourceFile(projectRoot, finding.path) : undefined;
    if (file === undefined) {
      return true;
    }
    entities ??= javaEntities(projectRoot, sourceRoots);
    const source = sources.get(file) ?? fetchSource(readFileSync(file, 'utf8'));
    sources.set(file, source);
    const line = finding.location?.line ?? 1;
    const found =
      finding.rule === PAGED_FETCH_RULE
        ? collectionFetchAt(source, line, entities.relationOf)
        : crossedFetchAt(source, line, entities.relationOf);
    return found !== undefined;
  });
}
