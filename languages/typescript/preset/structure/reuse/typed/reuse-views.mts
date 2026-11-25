import type { Finding } from '../../../../../../shared/values/findings.mts';
import { RULE_IDS as untypedRuleIds } from '../../../../../../shared/policy.mts';
import {
  reuseFinding as untypedReuseFinding,
  uniqueFindings as untypedUniqueFindings,
} from '../../../../../../shared/rules/reuse/reuse-finding.mts';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../../shared/rules/exceptions.mts';
export const RULE_IDS: {
  readonly newIconAsset: string;
  readonly redefinedLibraryComponent: string;
} = untypedRuleIds;

export const reuseFinding: (
  analyzerName: string,
  details: {
    readonly key: string;
    readonly path: string;
    readonly identity: string;
    readonly symbol: string | undefined;
    readonly line: number | undefined;
    readonly values: Readonly<Record<string, string>>;
  },
) => Finding = untypedReuseFinding;

export const uniqueFindings: (findings: readonly Finding[]) => Finding[] = untypedUniqueFindings;

export const exceptionMatcher: (
  exceptions: readonly unknown[],
) => (rule: string, ...candidates: readonly string[]) => boolean = untypedExceptionMatcher;

export {
  hasScopePackage,
  isScopePackage,
  readDependencyNames,
  scopePackage,
} from '../../../eslint-config/scope-support.mts';
