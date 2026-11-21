import type { EslintOptions } from '../../eslint/arguments.mts';
export { projectLayerValue } from '../project-layer.mts';
import {
  troubleshootingError as untypedTroubleshootingError,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mts';

export type LintEngineOptions = Pick<
  EslintOptions,
  'projectRoot' | 'liveProjectRoot' | 'configRelativePath' | 'environment' | 'patterns'
> & { readonly timeoutMs: number | undefined; readonly eslintCliPath?: string | undefined };

export type RunEslintCli = (
  patterns: readonly string[],
  extraEnvironment?: Readonly<Record<string, string>>,
) => Promise<unknown>;

export const troubleshootingError: (
  message: string,
  anchor: string | undefined,
  options?: ErrorOptions,
) => Error = untypedTroubleshootingError;

export const withTroubleshooting: (message: string, anchor: string) => string =
  untypedWithTroubleshooting;
