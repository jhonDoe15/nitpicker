import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { JpaFilterOptions } from '../jpa-types.mts';
import type { FetchSource } from './fetch-types.mts';
import { crossedFetchAt, fetchSource } from './java/fetch-sites.mts';
import { javaEntities } from './java/java-entities.mts';

export const COLLECTION_FETCH_RULE = 'JpaMultipleCollectionFetch';

function isCandidate(finding: JavaFinding): boolean {
  return (
    finding.tool === 'pmd' &&
    finding.rule === COLLECTION_FETCH_RULE &&
    finding.path.endsWith('.java')
  );
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
    return crossedFetchAt(source, line, entities.relationOf) !== undefined;
  });
}
