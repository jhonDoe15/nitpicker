import { ingestPythonCrap } from '../../ingest/crap.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { PythonFunctionEntry, Roots } from '../../ingest/typed/coverage-types.mts';
import {
  functionText as untypedFunctionText,
  testFileMatcher,
} from '../analysis/python-sources.mts';

const functionText: (
  sources: Map<string, string[]>,
  projectRoot: string,
  range: { file: string; start: number; end: number },
) => string = untypedFunctionText;

type CrapRequest = {
  readonly functions: readonly PythonFunctionEntry[];
  readonly coverage: string;
  readonly projectRoot: string;
  readonly roots: Roots;
  readonly crapLimit?: number | undefined;
};

export function readPythonCrapFindings({
  functions,
  coverage,
  projectRoot,
  roots,
  crapLimit,
}: CrapRequest): IngestedFinding[] {
  const sources = new Map<string, string[]>();
  const isTest = testFileMatcher(projectRoot);
  const production = functions.filter(({ file }) => !isTest(file));
  return ingestPythonCrap(production, coverage, {
    roots,
    ...(crapLimit === undefined ? {} : { limit: crapLimit }),
    sourceText: (entry) => functionText(sources, projectRoot, entry),
  }).findings;
}
