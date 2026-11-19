import type { Linter } from 'eslint';
import { applyJavascriptDialect as untypedApplyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mts';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../head-policy.mts';
import {
  applyMatchingRuleExceptions as untypedApplyMatchingRuleExceptions,
  applyRuleExceptions as untypedApplyRuleExceptions,
  checkExceptionRules as untypedCheckExceptionRules,
  type ExceptionRule,
} from '../exceptions.mts';
import type { ScopeLayout } from './config-types.mts';

type PolicyLayout = ScopeLayout & {
  readonly unitTestGlobs: string[];
  readonly entryPoints: string[];
};

type HeadPolicy = { readonly exceptions: readonly ExceptionRule[] };

export const readLayout: () => PolicyLayout = untypedReadLayout;

export const readHeadPolicy: () => HeadPolicy = untypedReadHeadPolicy;

const dialectApplied: (
  entries: Linter.Config[],
  policy: { readonly preset?: string; readonly exceptions?: unknown[] },
) => Linter.Config[] = untypedApplyJavascriptDialect;

export function applyJavascriptDialect(
  entries: Linter.Config[],
  policy: { readonly preset?: string; readonly exceptions?: readonly unknown[] },
): Linter.Config[] {
  const { exceptions, ...rest } = policy;
  return dialectApplied(
    entries,
    exceptions === undefined ? rest : { ...rest, exceptions: [...exceptions] },
  );
}

export const applyMatchingRuleExceptions: (
  entries: readonly Linter.Config[],
  exceptions: readonly ExceptionRule[],
) => Linter.Config[] = untypedApplyMatchingRuleExceptions;

export const applyRuleExceptions: (
  entries: readonly Linter.Config[],
  exceptions: {
    readonly rule: string;
    readonly paths: string[];
    readonly reason: string;
    readonly function?: string;
  }[],
  options?: { readonly projectRules?: true },
) => Linter.Config[] = untypedApplyRuleExceptions;

export const checkExceptionRules: (
  entries: Linter.Config[],
  exceptionEntries: Linter.Config[],
) => void = untypedCheckExceptionRules;

export const resolveHeadPolicy: (
  config: Readonly<Record<string, unknown>>,
  projectRoot?: string,
) => {
  readonly exceptions?: readonly unknown[] | undefined;
  readonly i18n?: unknown;
  readonly react?: unknown;
} = untypedResolveHeadPolicy;
