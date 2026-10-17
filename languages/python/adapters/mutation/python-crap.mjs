import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { ingestPythonCrap } from '../../ingest/crap.mjs';
import { functionText } from '../analysis/python-sources.mjs';

export function readPythonCrapFindings({ functions, coverage, projectRoot, roots, crapLimit }) {
  const sources = new Map();
  return ingestPythonCrap(functions, coverage, {
    roots,
    limit: crapLimit,
    sourceHash: (entry) => hash(functionText(sources, projectRoot, entry)),
  }).findings;
}
