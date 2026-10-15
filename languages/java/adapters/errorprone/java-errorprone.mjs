import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReportPath } from '../../ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';

const ERROR_PRONE_REPORT = 'errorprone.json';

export function readErrorProneFindings({ reportRoot, roots, lintedRoots }) {
  const reportPath = path.join(reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [];
  }
  return ingestErrorProne(readFileSync(reportPath, 'utf8'), {
    resolvePath: (file) => lintedPath(file, roots, lintedRoots),
  }).findings;
}

function lintedPath(file, roots, lintedRoots) {
  for (const root of roots) {
    const relative = normalizeReportPath(file, root);
    if (
      relative !== undefined &&
      lintedRoots.some((sourceRoot) => relative.startsWith(`${sourceRoot}/`))
    ) {
      return relative;
    }
  }
  return undefined;
}
