import type { RuleContext } from '../../facts/typed/fact-types.mts';

export type RoleLike = {
  readonly kind?: string | undefined;
  readonly directory?: string | undefined;
  readonly name?: string | undefined;
  readonly folder?: string | undefined;
  readonly face?: string | undefined;
  readonly isPublic?: unknown;
};

export type FeatureSide = RoleLike & {
  readonly kind: 'feature';
  readonly directory: string;
  readonly name: string;
};

export type FeatureRole = { readonly kind: 'shared' } | { readonly kind: 'other' } | FeatureSide;

export type PublicFeatureRole = FeatureSide & {
  readonly isPublic: boolean;
  readonly face: string;
};

export type RoleOf = (file: string) => RoleLike;

export type PublicFace = {
  readonly isPublic: (name: string) => boolean;
  readonly describe: (directory: string) => string;
};

export type FeatureLayoutInput = {
  readonly sharedRoots?: readonly string[] | undefined;
  readonly featureRoots?: readonly string[] | undefined;
  readonly sharedInsideFeatures?: unknown;
  readonly notFeatures?: readonly string[] | undefined;
  readonly notFeatureFolders?: readonly string[] | undefined;
  readonly aliases?: Readonly<Record<string, string>> | undefined;
};

export type FeatureLayout = {
  readonly sharedRoots: readonly string[];
  readonly featureRoots: readonly string[];
  readonly sharedInsideFeatures: boolean;
  readonly notFeatures: readonly string[];
  readonly notFeatureFolders: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
};

export type RoleLayout = Pick<FeatureLayout, 'sharedRoots' | 'featureRoots'> &
  Partial<Omit<FeatureLayout, 'sharedRoots' | 'featureRoots'>>;

export type FeatureContext = RuleContext & { readonly roleOf: RoleOf };
