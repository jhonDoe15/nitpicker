import type {
  FeatureRole as SharedFeatureRole,
  PublicFeatureRole,
} from '../../../../shared/rules/features/typed/role-types.mts';
import type { CouplingReport } from '../../../../shared/rules/typed/coupling-report-types.mts';

export type CouplingEdge = { readonly source: string; readonly target: string };

export type FeatureRole = SharedFeatureRole | PublicFeatureRole;

export type CouplingFeatures = {
  readonly classFiles?: ReadonlyMap<string, string> | undefined;
  readonly generatedFiles: ReadonlySet<string>;
};

export type KotlinModules = {
  readonly fileOf: ReadonlyMap<string, string>;
  readonly moduleOf: ReadonlyMap<string, string>;
};

export type CouplingOptions = {
  readonly classes: readonly string[];
  readonly edges: readonly CouplingEdge[];
  readonly fileOf: (className: string) => string;
  readonly moduleOf?: (className: string) => string;
  readonly layout?: unknown;
};

export type CouplingProject = {
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
  readonly kotlin?: KotlinModules | undefined;
  readonly files?: ReadonlyMap<string, string | undefined> | undefined;
  readonly layout?: unknown;
  readonly features?: CouplingFeatures | undefined;
};

export type { CouplingReport };
