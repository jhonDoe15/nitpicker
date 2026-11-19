import { isExplainedCycle as untypedIsExplainedCycle } from '../../../../../shared/graph/explained-cycles.mjs';
import { stronglyConnected as untypedStronglyConnected } from '../../../../../shared/graph/strongly-connected.mjs';
import { featureCycleAnalysis as untypedFeatureCycleAnalysis } from '../../../../../shared/rules/features/feature-cycles.mjs';
import {
  PUBLIC_FACES,
  featureRoleContract as untypedFeatureRoleContract,
} from '../../../../../shared/rules/features/feature-roles.mjs';
import { listed as untypedListed } from '../../../../../shared/rules/features/feature-boundaries.mjs';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';

export type ImportEdge = {
  readonly from: string;
  readonly to: string;
  readonly typeOnly: boolean;
};

export type FolderEdge = {
  readonly source: string;
  readonly target: string;
  readonly files: string;
};

export type FeatureView = {
  readonly explainedCycles: readonly unknown[];
  readonly featureOf: (file: string | undefined) => string | undefined;
};

type RoleOf = (file: string) => { readonly directory?: string };

type IsExcepted = (rule: string, ...candidates: string[]) => boolean;

export const stronglyConnected: (
  nodes: readonly string[],
  edges: readonly { readonly source: string; readonly target: string }[],
) => string[][] = untypedStronglyConnected;

export const isExplainedCycle: (
  members: readonly string[],
  context: {
    readonly packaged: readonly FolderEdge[];
    readonly anchor: ReadonlyMap<string, string>;
    readonly features: FeatureView;
  },
) => boolean = untypedIsExplainedCycle;

export const featureCycleAnalysis: (
  facts: { readonly imports: readonly (ImportEdge & { readonly role: string })[] },
  context: {
    readonly analyzerName: string;
    readonly isExcepted: IsExcepted;
    readonly roleOf: RoleOf;
  },
) => { readonly cycles: readonly unknown[] } = untypedFeatureCycleAnalysis;

export const featureRoleContract: (layout: unknown, face: unknown) => RoleOf =
  untypedFeatureRoleContract;

export const TYPESCRIPT_FACE: unknown = PUBLIC_FACES.typescript;

export const listed: (items: readonly string[]) => string = untypedListed;

export const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
