import { computeCoupling as untypedComputeCoupling } from '../../../../../shared/rules/coupling.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../../../shared/paths/glob.mjs';
import {
  featureRoles as untypedFeatureRoles,
  PUBLIC_FACES as UNTYPED_PUBLIC_FACES,
  withPublicFace as untypedWithPublicFace,
} from '../../../../../shared/rules/features/feature-roles.mjs';
import { sharedUsedByOneFeature as untypedSharedUsage } from '../../../../../shared/rules/features/shared-usage.mjs';
import type {
  CouplingInput,
  CouplingMetrics,
  FeatureLayoutInput,
  Matcher,
  PublicFace,
  RoleOf,
  SharedEntry,
  SharedImport,
} from './coupling-types.mts';

export const computeCoupling: (input: CouplingInput) => CouplingMetrics = untypedComputeCoupling;

export const globMatcher: (glob: string) => Matcher = untypedGlobMatcher;

export const featureRoles: (layout: FeatureLayoutInput) => RoleOf = untypedFeatureRoles;

export const PUBLIC_FACES: { readonly typescript: PublicFace } = UNTYPED_PUBLIC_FACES;

export const withPublicFace: (roleOf: RoleOf, publicFace: PublicFace) => RoleOf =
  untypedWithPublicFace;

export const sharedUsage: (
  input: { readonly modules: readonly string[]; readonly imports: readonly SharedImport[] },
  options: { readonly roleOf: RoleOf },
) => SharedEntry[] = untypedSharedUsage;
