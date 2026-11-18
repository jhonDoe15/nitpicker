import { renderMessage as untypedRender } from '../../../../shared/policy.mjs';
import { hash as untypedHash } from '../../../../shared/rules/finding-helpers.mjs';
import { applyRuleHints as untypedApplyHints } from '../../rules/rule-hints.mts';
import {
  importLinterCompleted as untypedCompleted,
  ingestImportLinter as untypedImportLinter,
} from '../import-linter.mts';
import type { FindingsResult, IngestedFinding } from './ingest-types.mts';

export const renderMessage: (
  template: unknown,
  values: Readonly<Record<string, unknown>>,
) => string = untypedRender;
export const applyRuleHints: (findings: readonly IngestedFinding[]) => IngestedFinding[] =
  untypedApplyHints;
export const hash: (text: string) => string = untypedHash;
export const importLinterCompleted: (text: string) => boolean = untypedCompleted;
export const ingestImportLinter: (
  text: string,
  options?: { files?: Map<string, string> },
) => FindingsResult = untypedImportLinter;
export { functionBlocks, ingestMutmut, statusOfExitCode } from '../mutmut.mts';
