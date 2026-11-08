import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { crossedFetchAt } from './fetch-sites.mjs';
import { javaEntities } from './java-entities.mjs';

export const COLLECTION_FETCH_RULE = 'JpaMultipleCollectionFetch';

export function withCrossedFetches(findings, { projectRoot, sourceRoots = [] }) {
  let entities;
  return findings.filter((finding) => {
    const file = path.join(projectRoot, finding.path ?? '');
    if (
      finding.tool !== 'pmd' ||
      finding.rule !== COLLECTION_FETCH_RULE ||
      !finding.path?.endsWith('.java') ||
      !existsSync(file)
    ) {
      return true;
    }
    entities ??= javaEntities(projectRoot, sourceRoots);
    const line = finding.location?.line ?? 1;
    return crossedFetchAt(readFileSync(file, 'utf8'), line, entities.relationOf) !== undefined;
  });
}
