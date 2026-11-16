import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import {
  analyzePythonCoupling as untypedAnalyze,
  importEdges as untypedImportEdges,
  readCouplingFindings as untypedReadFindings,
} from '../python-coupling.mjs';
import type { ImportEdge, ImportsByFile, PythonModule } from './python-graph-types.mts';

type CouplingInput = { readonly modules: readonly PythonModule[]; readonly imports: ImportsByFile };
type CouplingOptions = { readonly layout?: unknown };
type CouplingReport = {
  readonly summary: { readonly modules: number; readonly dependencies: number };
  readonly packages: readonly { readonly name: string }[];
  readonly modules: readonly ({ readonly file: string } & Readonly<Record<string, unknown>>)[];
  readonly stabilityDirection: readonly { readonly source: string; readonly target: string }[];
};

const analyzePythonCoupling: (input: CouplingInput, options?: CouplingOptions) => CouplingReport =
  untypedAnalyze;
const importEdges: (modules: readonly PythonModule[], imports: ImportsByFile) => ImportEdge[] =
  untypedImportEdges;
const readCouplingFindings: (reportRoot: string, options?: CouplingOptions) => IngestedFinding[] =
  untypedReadFindings;

export { analyzePythonCoupling, importEdges, readCouplingFindings };
