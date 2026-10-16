import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { ingestPythonCrap } from '../../ingest/crap.mjs';
import { functionText } from '../analysis/python-sources.mjs';
import { TEST_PATH } from '../execution/python-project.mjs';

export function readPythonCrapFindings({ functions, coverage, projectRoot, roots, crapLimit }) {
  const sources = new Map();
  const production = functions.filter(({ file }) => !TEST_PATH.test(file));
  return ingestPythonCrap(production, coverage, {
    roots,
    limit: crapLimit,
    sourceHash: (entry) => hash(functionText(sources, projectRoot, entry)),
  }).findings;
}
