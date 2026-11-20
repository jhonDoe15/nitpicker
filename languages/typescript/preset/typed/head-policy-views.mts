import { resolveJscpdPolicy } from '../../../../core/tooling/jscpd/config.mts';
import {
  readHeadPolicyFile,
  readHeadPolicySource,
  resolveHeadPolicy as resolveSharedHeadPolicy,
} from '../../../../shared/head-policy.mjs';
import { picked as untypedPicked } from '../../../../shared/config.mjs';
import type { Environment } from '../../../../shared/processes/environment.mts';
import { globMatcher } from '../layout.mts';
import { withHeadToolConfigs } from '../project-configs/head-tool-configs.mts';
import type {
  HeadConfig,
  HeadPolicyFile,
  ToolSettings,
  ToolSettingsMap,
} from './head-policy-types.mts';

type Fields = Readonly<Record<string, unknown>>;
type FileMatcher = (file: string) => boolean;

function isToolSettings(value: unknown): value is ToolSettings {
  return typeof value === 'object' && value !== null;
}

export const picked: (source: Fields, keys: readonly string[]) => Fields = untypedPicked;
export const resolveSharedPolicy: (config: HeadConfig) => HeadPolicyFile = resolveSharedHeadPolicy;
export const readPolicyFile: (environment: Environment) => HeadPolicyFile = readHeadPolicyFile;
export const readPolicySource: (environment: Environment) => {
  policyFile: string | undefined;
  text: string | undefined;
} = readHeadPolicySource;
export function jscpdPolicy(
  settings: ToolSettings | undefined,
  projectRoot: string,
): ToolSettings | undefined {
  const resolved = resolveJscpdPolicy(settings, projectRoot);
  return isToolSettings(resolved) ? resolved : undefined;
}
export const matcherOf: (glob: string) => { test: FileMatcher } = globMatcher;
export const headToolConfigs: (
  tools: ToolSettingsMap | undefined,
  context: { policy: HeadPolicyFile; config: HeadConfig },
  projectRoot: string,
) => ToolSettingsMap | undefined = withHeadToolConfigs;
