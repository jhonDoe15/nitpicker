import { renderMessage as untypedRender } from '../../../../shared/policy.mjs';
import { hash as untypedHash } from '../../../../shared/rules/finding-helpers.mjs';
import { applyRuleHints as untypedApplyHints } from '../../rules/rule-hints.mjs';
import {
  importLinterCompleted as untypedCompleted,
  ingestImportLinter as untypedImportLinter,
} from '../import-linter.mjs';
import {
  functionBlocks as untypedFunctionBlocks,
  ingestMutmut as untypedMutmut,
  statusOfExitCode as untypedStatus,
} from '../mutmut.mjs';
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
export const ingestMutmut: (data: unknown, options?: { tool?: string }) => FindingsResult =
  untypedMutmut;
export const statusOfExitCode: (exitCode: unknown) => string = untypedStatus;
export const functionBlocks: (source: string) => Map<string, string[]> = untypedFunctionBlocks;
