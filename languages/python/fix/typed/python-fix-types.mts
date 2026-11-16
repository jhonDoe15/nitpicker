import type { FixFile, FixInvocation, FixWriter } from '../../../../core/fix/typed/fix-types.mts';
import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';
import type { ToolContext } from '../../adapters/typed/context/tool-context-types.mts';
import type { SpawnResult } from '../../adapters/execution/typed/process-types.mts';
import type { FixPolicy, RunRequest } from '../python-fix-session.mts';
import type { RecipeInputs } from './fix-types.mts';

export type PythonFixSettings = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly config: NitpickerConfig;
  readonly headPolicy?: FixPolicy;
  readonly selectedRules?: readonly string[];
  readonly executeFixCommand: (invocation: FixInvocation) => unknown;
  readonly writer: FixWriter;
};

export type RunSettings = PythonFixSettings & {
  readonly headPolicy: FixPolicy;
  readonly selectedRules: readonly string[];
  readonly accepts: (name: string) => boolean;
};

export type FormatterInfo = { readonly operation: string; readonly label: string };

export type StepInput = {
  readonly context: ToolContext;
  readonly run: (request: RunRequest) => SpawnResult;
  readonly settings: RunSettings;
  readonly projectRoot: string;
  readonly files: readonly FixFile[];
  readonly mergeBaseSha: string | undefined;
  readonly selectedRules: readonly string[];
  readonly writer: FixWriter;
};

export type Gathered = { readonly inputs: RecipeInputs; readonly toolErrors: unknown[] };

export type FixersResult = {
  readonly fixedFindings?: readonly string[];
  readonly renamed?: readonly FixFile[];
  readonly toolErrors: unknown[];
  readonly notes: string[];
};
