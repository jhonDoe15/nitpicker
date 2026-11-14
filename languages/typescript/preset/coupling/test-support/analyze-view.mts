import { analyzeCoupling as untypedAnalyzeCoupling } from '../analyze.mjs';
import { sharedUsedByOneFeature as untypedSharedUsedByOneFeature } from '../shared-usage.mjs';
import type { resolveLayout } from '../../layout.mjs';

export type CouplingModule = {
  readonly source: string;
  readonly dependencies?: readonly {
    readonly resolved: string;
    readonly dependencyTypes: readonly string[];
  }[];
};

export type CouplingGraph = { readonly modules: readonly CouplingModule[] | undefined };

export type SharedEntry = {
  readonly source: string;
  readonly feature: string;
  readonly directory: string;
};

type Direction = {
  readonly source: string;
  readonly target: string;
  readonly sourceInstability: number;
  readonly targetInstability: number;
  readonly delta: number;
  readonly cause: { readonly folders: readonly string[] };
};

type CouplingReport = {
  readonly summary: object;
  readonly modules: readonly { readonly source: string }[];
  readonly packages: readonly { readonly name: string; readonly cohesion: object }[];
  readonly stabilityDirection: readonly Direction[];
  readonly sharedUsedByOneFeature: readonly SharedEntry[];
};

export type CouplingOptions = {
  readonly layout?: ReturnType<typeof resolveLayout>;
  readonly projectRoot?: string;
  readonly roleOf?: (file: string) => { readonly kind: string };
};

export type SharedUsage = (
  graph: CouplingGraph,
  options: { readonly sourceRoot: string; readonly isProduction: (file: string) => boolean },
) => SharedEntry[];

export const analyzeCoupling: (
  graph: CouplingGraph,
  sourceRoot: string,
  options?: CouplingOptions,
) => CouplingReport = untypedAnalyzeCoupling;

export const sharedUsedByOneFeature: SharedUsage = untypedSharedUsedByOneFeature;
