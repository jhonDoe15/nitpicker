import {
  listProductionModules as untypedModules,
  writeSourceListing as untypedListing,
} from '../../adapters/analysis/python-sources.mjs';
import {
  pythonFileLimitFindings as untypedFileLimits,
  readPythonStructureFindings as untypedStructureFindings,
} from '../../adapters/analysis/python-structure.mjs';
import type { PythonModule } from '../../adapters/analysis/typed/python-graph-types.mts';

export const listProductionModules: (
  projectRoot: string,
  sourceRoots: readonly string[],
) => PythonModule[] = untypedModules;
export const writeSourceListing: (input: {
  projectRoot: string;
  reportRoot: string;
  project: { sourceRoots: readonly string[] };
}) => { files: string[]; listing: string } = untypedListing;
export const pythonFileLimitFindings: (
  projectRoot: string,
  limits: { fileLimits: object },
) => { rule: string; path: string }[] = untypedFileLimits;
export const readPythonStructureFindings: (
  reportRoot: string,
  projectRoot: string,
) => { rule: string; symbol: string; message: string }[] = untypedStructureFindings;
