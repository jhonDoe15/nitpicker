import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';

export type JdkRequirements = Readonly<Record<string, string>>;

export type ToolchainContext = {
  readonly projectRoot: string;
  readonly home: string;
  readonly environment: JavaEnvironment;
  readonly maven?: unknown;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: unknown;
};
