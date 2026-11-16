import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import type { JdkRequirements, ToolchainContext } from './toolchain-types.mts';

export type KotlinRoots = {
  readonly jdkToolchain: JdkRequirements | undefined;
  readonly allOpen: { readonly annotations: string[]; readonly presets: string[] };
  readonly sourceRoots: string[];
  readonly testSourceRoots: string[];
};

export type KotlinModule = {
  readonly basedir: string;
  readonly buildDirectory: string;
  readonly outputDirectory: string;
  readonly testOutputDirectory: string;
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots: readonly string[];
  readonly kotlin: KotlinRoots;
};
export type ProjectModule = Omit<KotlinModule, 'kotlin'> & {
  readonly kotlin?: KotlinRoots | undefined;
};
export type ToolClasspaths = Readonly<Record<string, readonly string[] | undefined>>;
export type KotlinClasspaths = {
  readonly mainCompile: readonly string[];
  readonly testCompile: readonly string[];
};
export type EditorConfigFile = { readonly path: string; readonly text: string };
export type KotlinStyle = {
  readonly editorconfigs?: readonly EditorConfigFile[] | undefined;
  readonly offset?: string | undefined;
  readonly ktlintDefaults?: string | undefined;
  readonly detektConventions?: string | undefined;
  readonly detektEnforced?: string | undefined;
};
export type KotlinOptions = {
  readonly projectRoot: string;
  readonly toolchains: ToolchainContext;
  readonly spawn: JavaSpawn | undefined;
  readonly timeoutMs: unknown;
  readonly psiClasses: string;
  readonly formatter: string;
  readonly ktfmtStyle: string | undefined;
  readonly ktfmtMaxWidth: unknown;
  readonly ktfmtEditorconfig: boolean;
  readonly style: KotlinStyle;
  readonly advice: unknown;
  readonly detektLayers: readonly string[];
  readonly detektLists: string | undefined;
};
