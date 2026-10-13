import path from 'node:path';
import { readStructureFindings } from '../../java/adapters/java-structure.mjs';
import { run } from './python-process.mjs';
import { functionText, writeSourceListing } from './python-sources.mjs';

const METRICS_SCRIPT = path.resolve(import.meta.dirname, '../metrics/structure_metrics.py');
export const STRUCTURE_REPORT = 'structure.json';
const STRUCTURE_HINTS = {
  maxControlNesting:
    'An elif chain counts one level per branch; use match, a dict lookup or a helper function.',
};

export function structure(context) {
  const { listing } = writeSourceListing(context);
  run(
    context,
    [
      'python',
      METRICS_SCRIPT,
      path.join(context.reportRoot, STRUCTURE_REPORT),
      context.projectRoot,
      listing,
    ],
    { rule: 'structure-failed' },
  );
}

export function readPythonStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot, functionText, STRUCTURE_HINTS);
}
