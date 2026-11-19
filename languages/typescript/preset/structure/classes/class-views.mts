import { resolveModuleSpecifier as untypedResolveModuleSpecifier } from '../../modules/module-resolution.mjs';
import { classLimitFindings as untypedClassLimitFindings } from '../../../../../shared/rules/size/class-limits.mjs';
import { containedPath as untypedContainedPath } from '../../../../../core/fix/common/contained-path.mjs';
import type { Finding } from '../../../adapters/static-checks/shared.mts';

export const resolveModuleSpecifier: (
  written: string,
  containingFile: string,
) => { readonly kind: string; readonly path?: string } = untypedResolveModuleSpecifier;

export const classLimitFindings: (
  classes: readonly object[],
  options: {
    readonly analyzerName: string;
    readonly thresholds: unknown;
    readonly exceptions: unknown[];
  },
) => Finding[] = untypedClassLimitFindings;

export const containedPath: (root: string, name: string) => string = untypedContainedPath;
