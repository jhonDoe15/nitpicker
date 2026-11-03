import { ingestPythonCrap } from '../../ingest/crap.mjs';
import { functionText } from '../analysis/python-sources.mjs';
import { TEST_PATH } from '../execution/python-test-files.mjs';

export function readPythonCrapFindings({ functions, coverage, projectRoot, roots, crapLimit }) {
  const sources = new Map();
  const production = functions.filter(({ file }) => !TEST_PATH.test(file));
  return ingestPythonCrap(production, coverage, {
    roots,
    limit: crapLimit,
    sourceText: (entry) => functionText(sources, projectRoot, entry),
  }).findings;
}
