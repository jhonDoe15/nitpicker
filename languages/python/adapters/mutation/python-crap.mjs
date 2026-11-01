import { ingestPythonCrap } from '../../ingest/crap.mjs';
import { functionText, testFileMatcher } from '../analysis/python-sources.mjs';

export function readPythonCrapFindings({ functions, coverage, projectRoot, roots, crapLimit }) {
  const sources = new Map();
  const isTest = testFileMatcher(projectRoot);
  const production = functions.filter(({ file }) => !isTest(file));
  return ingestPythonCrap(production, coverage, {
    roots,
    limit: crapLimit,
    sourceText: (entry) => functionText(sources, projectRoot, entry),
  }).findings;
}
