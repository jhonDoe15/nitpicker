import { isPlainObject } from '../../../../../shared/values/readers.mts';
import type { RunOptions, SpawnResult } from '../../execution/typed/process-types.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type { CouplingReport } from '../../../../../shared/rules/typed/coupling-report-types.mts';
import type { ImportsByFile, ImportsReport } from './python-graph-types.mts';

export type CouplingInput = {
  readonly modules: ImportsReport['modules'];
  readonly imports: ImportsByFile;
};
export type CouplingOptions = { readonly layout?: unknown };
export type { CouplingReport };

export function isImportsByFile(value: unknown): value is ImportsByFile {
  return isPlainObject(value) && Object.values(value).every((entry) => Array.isArray(entry));
}

export function isImportsReport(value: unknown): value is ImportsReport {
  return (
    isPlainObject(value) && Array.isArray(value['modules']) && isImportsByFile(value['imports'])
  );
}

type RunTool<Context = ToolContext, Result = SpawnResult> = (
  context: Context,
  command: readonly string[],
  options: RunOptions,
) => Result;

export type StdoutRun<Context> = RunTool<Context, Pick<SpawnResult, 'stdout'>>;

export type OutputRun<Context> = RunTool<Context, Pick<SpawnResult, 'stdout' | 'stderr'>>;

export type RootsContext = Pick<ToolContext, 'projectRoot' | 'reportRoot'>;

export type ScanContext = Pick<ToolContext, 'projectRoot' | 'reportRoot'> & {
  readonly project: { readonly sourceRoots: readonly string[] };
};
