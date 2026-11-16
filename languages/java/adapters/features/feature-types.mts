import type { ClassEntry, ClassProject } from '../domain/domain-types.mts';
import type { JavaFinding } from '../typed/java-values.mts';

export type FeatureLayout = {
  readonly sharedRoots?: readonly string[];
  readonly featureRoots?: readonly string[];
  readonly notFeatures?: readonly string[];
  readonly notFeatureFolders?: readonly string[];
  readonly aliases?: Readonly<Record<string, string>>;
};

type SpringViolation = {
  readonly rule: string;
  readonly detail: string;
  readonly className: string;
};

export type SpringReport = {
  readonly qualifier: string;
  readonly root: unknown;
  readonly violations: readonly SpringViolation[];
};

export type FeaturePlan = {
  readonly layout: FeatureLayout;
  readonly boundaryRules: readonly string[];
  readonly covered: ReadonlySet<string>;
};

type FeatureModule = {
  readonly file: string;
  readonly role: string;
  readonly generated: boolean;
  readonly persistence?: string | undefined;
};

type FeatureImport = {
  readonly from: string;
  readonly to: string;
  readonly names: readonly { readonly name: string }[];
};

export type FeatureFactSet = {
  readonly modules: readonly FeatureModule[];
  readonly imports: readonly FeatureImport[];
};

export type FeatureAnalysis = {
  readonly findings: readonly JavaFinding[];
  readonly explainedCycles: unknown;
  readonly featureOf: (file: string) => string | undefined;
};

export type FeatureCycles = {
  readonly explainedCycles: unknown;
  readonly featureOf: (file: string) => string | undefined;
  readonly generatedFiles: ReadonlySet<string>;
  readonly classes?: readonly ClassEntry[];
};

export type GraphOptions = {
  readonly projects: readonly ClassProject[];
  readonly kotlin: boolean;
  readonly policy?: Readonly<Record<string, unknown>>;
};
