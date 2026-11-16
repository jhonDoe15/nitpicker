import type { JavaEnvironment, JavaPolicy } from '../../adapters/typed/java-values.mts';
import type { Classpaths, MavenModule, MavenScope } from './maven-values.mts';

export type MavenRun = {
  readonly projectRoot: string;
  readonly mavenRoot: string;
  readonly maven: string | undefined;
  readonly spawn: unknown;
  readonly timeoutMs: number | undefined;
  readonly pinned: unknown;
  readonly quick: boolean;
  readonly mutationOff: boolean;
};
type AnalyzedModule = {
  readonly module: MavenModule;
  readonly classpaths: Classpaths;
};
export type AnalyzeRequest = MavenRun & {
  readonly analyzed: readonly AnalyzedModule[];
  readonly policy: JavaPolicy;
  readonly kotlin: unknown;
  readonly work: string;
  readonly pitDeadline: number | undefined;
  readonly tools: unknown;
  readonly configs: unknown;
  readonly since: number;
  readonly project: unknown;
  readonly testsSkipped: boolean;
  readonly effectsOptions: unknown;
};
export type ToolsRequest = {
  readonly modules: readonly MavenModule[];
  readonly analyzed: readonly AnalyzedModule[];
  readonly policy: JavaPolicy;
  readonly pinned: unknown;
  readonly kotlin: unknown;
};
export type MavenPresetOptions = {
  readonly maven?: string | undefined;
  readonly policy?: JavaPolicy | undefined;
  readonly configs?: unknown;
  readonly environment?: JavaEnvironment | undefined;
  readonly spawn?: unknown;
  readonly timeoutMs?: number | undefined;
  readonly pitDeadline?: number | undefined;
};
export type MavenPresetRun = {
  readonly moduleDirs: string[];
  readonly testsFailures: unknown[];
  readonly formatAdvice: unknown;
  readonly notAffected: string[];
};
export type Prepared = {
  readonly modules: MavenModule[];
  readonly built: MavenModule[];
  readonly scope: MavenScope;
  readonly kotlin: unknown;
  readonly since: number;
  readonly analyzed: AnalyzedModule[];
  readonly tools: unknown;
  readonly timedOut: unknown[];
};
export type ReadModules = {
  readonly modules: MavenModule[];
  readonly built: MavenModule[];
  readonly scope: MavenScope;
  readonly effectivePom: unknown;
};

export type PrepareRequest = {
  readonly policy: JavaPolicy;
  readonly environment: JavaEnvironment;
  readonly configs: unknown;
  readonly work: string;
};
