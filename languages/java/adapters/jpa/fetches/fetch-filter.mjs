import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { crossedFetchAt, fetchSource } from './java/fetch-sites.mjs';
import { javaEntities } from './java/java-entities.mjs';

export const COLLECTION_FETCH_RULE = 'JpaMultipleCollectionFetch';

function isCandidate(finding) {
  return (
    finding.tool === 'pmd' &&
    finding.rule === COLLECTION_FETCH_RULE &&
    finding.path?.endsWith('.java') === true
  );
}

function sourceFile(projectRoot, relative) {
  const file = pathInside(projectRoot, relative);
  return file !== undefined && existsSync(file) ? file : undefined;
}

export function withCrossedFetches(findings, { projectRoot, sourceRoots = [] }) {
  let entities;
  const sources = new Map();
  return findings.filter((finding) => {
    const file = isCandidate(finding) ? sourceFile(projectRoot, finding.path) : undefined;
    if (file === undefined) {
      return true;
    }
    entities ??= javaEntities(projectRoot, sourceRoots);
    if (!sources.has(file)) {
      sources.set(file, fetchSource(readFileSync(file, 'utf8')));
    }
    const line = finding.location?.line ?? 1;
    return crossedFetchAt(sources.get(file), line, entities.relationOf) !== undefined;
  });
}
