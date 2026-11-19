import { existsSync } from 'node:fs';
import { pathInside as untypedPathInside } from '../../../../../shared/filesystem.mjs';
import { keepResults } from '../../jpa/jpa-source-filters.mts';
import type { SarifLog, SarifResult } from '../../jpa/jpa-types.mts';

const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;

function hasProjectSource(result: SarifResult, projectRoot: string): boolean {
  const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
  if (typeof uri !== 'string') {
    return true;
  }
  const full = pathInside(projectRoot, uri);
  return full !== undefined && existsSync(full);
}

export function withoutClassesWithoutSource(log: SarifLog, projectRoot: string): SarifLog {
  return keepResults(log, (result) => hasProjectSource(result, projectRoot));
}
