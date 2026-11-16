import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import {
  analyzePythonCoupling as untypedAnalyze,
  importEdges as untypedImportEdges,
  readCouplingFindings as untypedReadFindings,
} from '../python-coupling.mts';
import type { CouplingInput, CouplingOptions, CouplingReport } from './coupling-types.mts';
import type { ImportEdge, ImportsByFile, PythonModule } from './python-graph-types.mts';

const analyzePythonCoupling: (input: CouplingInput, options?: CouplingOptions) => CouplingReport =
  untypedAnalyze;
const importEdges: (modules: readonly PythonModule[], imports: ImportsByFile) => ImportEdge[] =
  untypedImportEdges;
const readCouplingFindings: (reportRoot: string, options?: CouplingOptions) => IngestedFinding[] =
  untypedReadFindings;

export { analyzePythonCoupling, importEdges, readCouplingFindings };
