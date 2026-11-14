import type { Finding } from '../../static-checks/shared.mts';
import type { Layout } from '../../typed/head-policy.mts';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import {
  layoutKnipProductionConfig as untypedLayoutKnipProductionConfig,
  withEntryExports as untypedWithEntryExports,
} from '../../../preset/unused-api/test-only/production-config.mjs';
import {
  needsProductionRun as untypedNeedsProductionRun,
  testOnlyExportFindings as untypedTestOnlyExportFindings,
} from '../../../preset/unused-api/test-only/test-only-exports.mjs';
import { loadPackages as untypedLoadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { testConsoleFindings as untypedTestConsoleFindings } from '../../../../../shared/rules/console/console-findings.mjs';

export const testConsoleFindings: (
  report: { readonly entries: readonly unknown[] },
  context: {
    readonly analyzerName: string;
    readonly allow: unknown[] | undefined;
    readonly exceptions: unknown[];
  },
) => Finding[] = untypedTestConsoleFindings;

export type KnipConfig = Readonly<Record<string, unknown>>;

export type IsExcepted = (rule: string, ...candidates: readonly unknown[]) => boolean;

export const exceptionMatcher: (exceptions: unknown[]) => IsExcepted = untypedExceptionMatcher;

export const layoutKnipProductionConfig: (config: KnipConfig, layout: Layout) => KnipConfig =
  untypedLayoutKnipProductionConfig;

export const withEntryExports: (config: KnipConfig) => KnipConfig = untypedWithEntryExports;

export const needsProductionRun: (packagesInfo: unknown, projectRoot: string) => boolean =
  untypedNeedsProductionRun;

export const loadPackages: (projectRoot: string, layout: Layout) => unknown = untypedLoadPackages;

export const testOnlyExportFindings: (run: {
  readonly normal: unknown;
  readonly production: unknown;
  readonly entryExportsRun: () => unknown;
  readonly packagesInfo: unknown;
  readonly context: {
    readonly layout: Layout;
    readonly entryPatterns: unknown;
    readonly projectRoot: string;
    readonly analyzerName: string;
    readonly isExcepted: IsExcepted;
  };
}) => Finding[] = untypedTestOnlyExportFindings;
