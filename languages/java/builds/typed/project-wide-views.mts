import { readCouplingFindings, parseJdeps } from '../../adapters/metrics/java-coupling.mjs';
import { readFeatureGraph } from '../../adapters/features/feature-findings.mjs';
import { kotlinModules, readKotlinMetrics } from '../../adapters/kotlin/kotlin-metrics.mjs';
import { readJavaFileLimitFindings } from '../../adapters/metrics/java-structure.mjs';
import { readCopiedConstantFindings } from '../../adapters/review-rules/copied-constants/copied-constants.mjs';
import { readMaxValueFindings } from '../../adapters/review-rules/max-value-sums/max-value-sums.mjs';
import { readRoundTripFindings } from '../../adapters/review-rules/round-trips/round-trips.mjs';
import { readTestOnlyClassFindings } from '../../adapters/review-rules/test-only-classes.mjs';
import { readJvmReuse } from '../../adapters/reuse/jvm-reuse-facts.mjs';
import { readTestRuntimeFindings } from '../../adapters/test-runtime/test-runtime-findings.mjs';
import { outerClass } from '../../ingest/class-names.mjs';
import { inModule } from '../module-path.mjs';
import type { JavaFinding, JavaPolicy } from '../../adapters/typed/java-values.mts';

export type ReportProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly filePrefix?: string | undefined;
};
type Manifest = {
  readonly sourceRoots?: readonly string[];
  readonly kotlinSourceRoots?: readonly string[];
  readonly testSourceRoots?: readonly string[];
  readonly kotlinTestSourceRoots?: readonly string[];
  readonly kotlinExcludedFiles?: readonly string[];
  readonly resourceRoots?: readonly string[];
};
export type KotlinNodes = {
  readonly moduleOf: Map<string, string>;
  readonly fileOf: Map<string, string>;
};
export type Cycles = Readonly<Record<string, unknown>> & {
  readonly classes?: readonly { qualifier: string; name: string; file: string }[];
};
export type JdeEdge = { readonly source: string; readonly target: string };
export type CouplingOptions = {
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
  readonly kotlin: KotlinNodes | undefined;
  readonly files: ReadonlyMap<string, string | undefined> | undefined;
  readonly layout: unknown;
  readonly features: unknown;
};
type WideOptions = {
  readonly projects: readonly ReportProject[];
  readonly kotlin: boolean;
  readonly policy: JavaPolicy;
};
type Reuse = { readonly findings: JavaFinding[]; readonly imports: unknown };
type FeatureGraph = {
  readonly layout: unknown;
  readonly findings: JavaFinding[];
  readonly cycles: Cycles;
};
type FileLimits = {
  readonly manifest: Manifest;
  readonly kotlin: boolean;
  readonly policy: Readonly<Record<string, unknown>>;
};

export type ProjectClasses = ReportProject & { readonly classes: string[] };
export type Declared = ReadonlyMap<string, string[]>;
export type ModuleReport = {
  readonly reportRoot: string;
  readonly key: string;
  readonly dir: string;
  readonly manifest: Manifest;
};
export type CouplingRun = {
  readonly projects: readonly ReportProject[];
  readonly mergedRoot: string;
  readonly manifest: Manifest;
  readonly kotlin: boolean;
  readonly layout: unknown;
  readonly features: unknown;
};
export type WideRun = {
  readonly projects: readonly ReportProject[];
  readonly mergedRoot: string;
  readonly manifest: Manifest;
  readonly kotlin: boolean;
  readonly policy: JavaPolicy;
};

export const inModuleOf: (modulePath: string | undefined, relativePath: string) => string =
  inModule;
export const outerClassOf: (className: string) => string = outerClass;
export function jdepsEdges(text: string): JdeEdge[] {
  return parseJdeps(text).flatMap(({ source, target }) =>
    source === undefined || target === undefined ? [] : [{ source, target }],
  );
}
export const couplingFindingsOf: (reportRoot: string, options: CouplingOptions) => JavaFinding[] =
  readCouplingFindings;
export const kotlinMetricsOf: (reportRoot: string) => unknown = readKotlinMetrics;
export const kotlinNodesOf: (metrics: unknown) => KotlinNodes = kotlinModules;
export const fileLimitFindings: (projectRoot: string, options: FileLimits) => JavaFinding[] =
  readJavaFileLimitFindings;
export const featureGraphOf: (
  projectRoot: string,
  options: Omit<WideOptions, 'policy'> & { readonly policy: Readonly<Record<string, unknown>> },
) => FeatureGraph = readFeatureGraph;
export const jvmReuseOf: (projectRoot: string, options: WideOptions) => Reuse = readJvmReuse;
export const testOnlyFindings: (
  projectRoot: string,
  options: { readonly projects: readonly ReportProject[] },
) => JavaFinding[] = readTestOnlyClassFindings;
export const testRuntimeFindings: (
  projectRoot: string,
  options: { readonly projects: readonly ReportProject[] },
) => JavaFinding[] = readTestRuntimeFindings;
export const roundTripFindings: (projectRoot: string, options: WideOptions) => JavaFinding[] =
  readRoundTripFindings;
export const copiedConstantFindings: (projectRoot: string, options: WideOptions) => JavaFinding[] =
  readCopiedConstantFindings;
export const maxValueFindings: (projectRoot: string, options: WideOptions) => JavaFinding[] =
  readMaxValueFindings;
