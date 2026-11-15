import { existsSync } from 'node:fs';
import { pathInside } from '../../../../../shared/filesystem.mjs';

function hasProjectSource(result, projectRoot) {
  const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
  if (typeof uri !== 'string') {
    return true;
  }
  const full = pathInside(projectRoot, uri);
  return full !== undefined && existsSync(full);
}

export function withoutClassesWithoutSource(log, projectRoot) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).filter((result) => hasProjectSource(result, projectRoot)),
    })),
  };
}
