import type { JavaEnvironment, JavaFinding, JavaPolicy, JavaSpawn } from './java-values.mts';

type JavaBudget = {
  readonly commandTimeoutMs?: number;
  readonly analyzerTimeoutMs?: number;
  readonly mavenCommandTimeoutMs?: number;
  readonly pitDeadlineMs?: number;
};
export type JavaRunOptions = {
  readonly gradle?: string | undefined;
  readonly maven?: string | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly initScript?: string | undefined;
  readonly environment?: JavaEnvironment | undefined;
  readonly policy?: JavaPolicy | undefined;
  readonly budget?: JavaBudget | undefined;
  readonly reportDirectory?: string | undefined;
  readonly resolveOverlaps?:
    ((findings: readonly JavaFinding[]) => readonly JavaFinding[]) | undefined;
};
export type JavaReport = {
  readonly findings: readonly JavaFinding[];
  readonly imports: unknown;
  readonly testsFailures?: unknown;
};
