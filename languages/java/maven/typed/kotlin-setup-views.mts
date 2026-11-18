import { kotlinStyleFile, resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mjs';
import { fieldOf, optionalText, textOf } from '../../../../shared/values/readers.mts';
import {
  type JavaEnvironment,
  type JavaPolicy,
  type JavaSpawn,
  callUntyped,
} from '../../adapters/typed/java-values.mts';
import type { KotlinPinned, kotlinTools } from '../kotlin/tools/kotlin-dependencies.mts';
import type { KotlinOptions, KotlinStyle, ProjectModule } from './kotlin-types.mts';

export type ResolvedTools = {
  readonly formatter: string;
  readonly ktfmtStyle: string | undefined;
  readonly ktfmtMaxWidth: unknown;
  readonly ktfmtEditorconfig: unknown;
  readonly detektConfig: string | undefined;
  readonly detektNitpickerFirst: boolean;
  readonly raw: unknown;
};
type ToolsRequest = {
  readonly formatter: unknown;
  readonly detektConfig: unknown;
  readonly snapshot: unknown;
  readonly conventions: object;
  readonly policyRoot: unknown;
  readonly toolPrecedence: unknown;
  readonly effectivePom: unknown;
  readonly facts: unknown;
};
export type KotlinSetup = {
  readonly options: KotlinOptions | undefined;
  readonly extraTools: ReturnType<typeof kotlinTools>;
};
export type KotlinSetupRequest = {
  readonly projectRoot: string;
  readonly mavenRoot?: string;
  readonly policy: JavaPolicy;
  readonly modules: readonly ProjectModule[];
  readonly effectivePom: unknown;
  readonly work: string;
  readonly pinned: KotlinPinned;
  readonly maven: unknown;
  readonly environment: JavaEnvironment;
  readonly spawn: JavaSpawn | undefined;
  readonly timeoutMs: unknown;
};
export type OptionsRequest = Pick<
  KotlinSetupRequest,
  'projectRoot' | 'policy' | 'effectivePom' | 'work'
> & { readonly toolchains: KotlinOptions['toolchains'] };

export function toolsOf(root: string, request: ToolsRequest): ResolvedTools {
  const tools = callUntyped(resolveKotlinTools, root, request);
  return {
    formatter: textOf(fieldOf(tools, 'formatter')),
    ktfmtStyle: optionalText(fieldOf(tools, 'ktfmtStyle')),
    ktfmtMaxWidth: fieldOf(tools, 'ktfmtMaxWidth'),
    ktfmtEditorconfig: fieldOf(tools, 'ktfmtEditorconfig'),
    detektConfig: optionalText(fieldOf(tools, 'detektConfig')),
    detektNitpickerFirst: fieldOf(tools, 'detektNitpickerFirst') === true,
    raw: tools,
  };
}
export const styleOf: (tools: unknown, conventions: unknown) => KotlinStyle | undefined =
  kotlinStyleFile;
