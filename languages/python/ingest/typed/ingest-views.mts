import { applyRuleHints as untypedApplyHints } from '../../rules/rule-hints.mts';
import {
  importLinterCompleted as untypedCompleted,
  ingestImportLinter as untypedImportLinter,
} from '../import-linter.mts';
import type { FindingsResult, IngestedFinding } from './ingest-types.mts';

export const applyRuleHints: (findings: readonly IngestedFinding[]) => IngestedFinding[] =
  untypedApplyHints;
export const importLinterCompleted: (text: string) => boolean = untypedCompleted;
export const ingestImportLinter: (
  text: string,
  options?: { files?: Map<string, string> },
) => FindingsResult = untypedImportLinter;
export { functionBlocks, ingestMutmut, statusOfExitCode } from '../mutmut.mts';
