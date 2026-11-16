import {
  existingSourceRoots as untypedExistingSourceRoots,
  functionText as untypedFunctionText,
  listOtherModules as untypedListOtherModules,
  listProductionModules as untypedListProductionModules,
  nonProductionGlobs as untypedNonProductionGlobs,
  pythonSourceFiles as untypedPythonSourceFiles,
  writeSourceListing as untypedWriteSourceListing,
  type SourceListing,
} from '../python-sources.mts';
import type { OtherModule, PythonModule } from './python-graph-types.mts';

const existingSourceRoots: (projectRoot: string, sourceRoots: readonly string[]) => string[] =
  untypedExistingSourceRoots;
const functionText: (
  sources: Map<string, string[]>,
  projectRoot: string,
  range: { file: string; start: number; end: number },
) => string = untypedFunctionText;
const listOtherModules: (
  projectRoot: string,
  sourceRoots: readonly string[],
  production: readonly PythonModule[],
) => OtherModule[] = untypedListOtherModules;
const listProductionModules: (
  projectRoot: string,
  sourceRoots: readonly string[],
) => PythonModule[] = untypedListProductionModules;
const nonProductionGlobs: (
  sourceRoots: readonly string[],
  projectRoot: string,
  skippedFolders?: string[],
) => string[] = untypedNonProductionGlobs;
const pythonSourceFiles: (projectRoot: string, sourceRoots: readonly string[]) => string[] =
  untypedPythonSourceFiles;
const writeSourceListing: (request: SourceListing) => { files: string[]; listing: string } =
  untypedWriteSourceListing;

export {
  existingSourceRoots,
  functionText,
  listOtherModules,
  listProductionModules,
  nonProductionGlobs,
  pythonSourceFiles,
  writeSourceListing,
};
