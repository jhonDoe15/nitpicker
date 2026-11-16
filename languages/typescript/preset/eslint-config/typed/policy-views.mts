import type { Linter } from 'eslint';
import { applyJavascriptDialect as untypedApplyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mts';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../head-policy.mjs';
import {
  applyMatchingRuleExceptions as untypedApplyMatchingRuleExceptions,
  applyRuleExceptions as untypedApplyRuleExceptions,
  checkExceptionRules as untypedCheckExceptionRules,
} from '../exceptions.mjs';
import type { ScopeLayout } from './config-types.mts';

type PolicyLayout = ScopeLayout & {
  readonly unitTestGlobs: string[];
  readonly entryPoints: string[];
};

type HeadPolicy = { readonly exceptions: unknown[] };

export const readLayout: () => PolicyLayout = untypedReadLayout;

export const readHeadPolicy: () => HeadPolicy = untypedReadHeadPolicy;

export const applyJavascriptDialect: (
  entries: Linter.Config[],
  policy: { readonly preset?: string; readonly exceptions?: unknown[] },
) => Linter.Config[] = untypedApplyJavascriptDialect;

export const applyMatchingRuleExceptions: (
  entries: readonly Linter.Config[],
  exceptions: unknown[],
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
  config: object,
  projectRoot?: string,
) => { readonly exceptions?: unknown[]; readonly i18n?: unknown; readonly react?: unknown } =
  untypedResolveHeadPolicy;
