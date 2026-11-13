import type { EslintOptions } from '../../eslint/arguments.mts';
import type { EslintToolSettings } from '../../typed/head-policy.mts';
import { projectLayerValue as untypedProjectLayerValue } from '../project-layer.mjs';
import {
  troubleshootingError as untypedTroubleshootingError,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';

export type LintEngineOptions = Pick<
  EslintOptions,
  | 'projectRoot'
  | 'liveProjectRoot'
  | 'configRelativePath'
  | 'environment'
  | 'patterns'
  | 'timeoutMs'
> & { readonly eslintCliPath?: string | undefined };

export type RunEslintCli = (
  patterns: readonly string[],
  extraEnvironment?: Readonly<Record<string, string>>,
) => Promise<unknown>;

export const projectLayerValue: (
  settings: EslintToolSettings | undefined,
  context: { readonly liveProjectRoot: string; readonly addsRules: boolean },
) => string = untypedProjectLayerValue;

export const troubleshootingError: (
  message: string,
  anchor: string,
  options?: ErrorOptions,
) => Error = untypedTroubleshootingError;

export const withTroubleshooting: (message: string, anchor: string) => string =
  untypedWithTroubleshooting;
