import type { InheritedMethod } from '../inherited-tests.mts';
import type { Locate } from './locate-type.mts';
import { inModule as inModuleUntyped } from '../../../builds/module-path.mts';
import { sourceLocator as sourceLocatorUntyped } from '../../reporting/kotlin-reports.mts';
import {
  MESSAGES as MESSAGES_UNTYPED,
  RULE_IDS as RULE_IDS_UNTYPED,
  messageFields as messageFieldsUntyped,
  renderMessage as renderMessageUntyped,
} from '../../../../../shared/policy.mjs';
import {
  shownSeconds as shownSecondsUntyped,
  slowestRuns as slowestRunsUntyped,
  slowTestBudget as slowTestBudgetUntyped,
} from '../../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { SLOW_TEST_FIXES as SLOW_TEST_FIXES_UNTYPED } from '../../../../../shared/rules/slow-tests/slow-test-fixes.mjs';
import {
  isIntegrationTest as isIntegrationTestUntyped,
  isSpringBootTest as isSpringBootTestUntyped,
  isUnitTestTask as isUnitTestTaskUntyped,
  sourceOf as sourceOfUntyped,
} from '../integration-tests.mts';
import { DECLARES_KOTEST_SPEC as DECLARES_KOTEST_SPEC_UNTYPED } from '../../test-runs/unrun-tests.mts';

export type TestCase = {
  readonly task: string;
  readonly file: string | undefined;
  readonly className: string;
  readonly name: string;
  readonly seconds: number;
  readonly containers?: readonly string[];
};
export type Method = { readonly line: number; readonly text: string };
export type SlowTest = {
  readonly testCase: TestCase;
  readonly source: string | undefined;
  readonly text: string | undefined;
  readonly method: Method | undefined;
  readonly declaring: InheritedMethod | undefined;
  readonly limit: number;
  readonly integration: boolean;
  readonly modulePath: string | undefined;
  readonly testRoots: readonly string[];
  readonly projectRoot: string;
};
export type SlowOptions = {
  readonly reportRoot: string;
  readonly projectRoot: string;
  readonly testRoots: readonly string[];
  readonly limits?: unknown;
  readonly baseline?: {
    readonly snapshot?: string | undefined;
    readonly baselineRoot?: string | undefined;
  };
  readonly modulePath?: string | undefined;
};

export const inModule: (modulePath: string | undefined, relativePath: string) => string =
  inModuleUntyped;
export const sourceLocator: (projectRoot: string, sourceRoots: readonly string[]) => Locate =
  sourceLocatorUntyped;
export const MESSAGES: { readonly slowTest: unknown } = MESSAGES_UNTYPED;
export const RULE_IDS: { readonly slowTest: string } = RULE_IDS_UNTYPED;
export const messageFields: (
  template: unknown,
  values: Readonly<Record<string, string | number>>,
) => { readonly message: string; readonly allowedForm?: string } = messageFieldsUntyped;
export const renderMessage: (
  template: unknown,
  values: Readonly<Record<string, string>>,
) => string = renderMessageUntyped;
export const shownSeconds: (seconds: number, limit: number) => string = shownSecondsUntyped;
export const slowestRuns: <T>(runs: readonly T[], keyOf: (run: T) => string) => T[] =
  slowestRunsUntyped;
export const slowTestBudget: (limits: unknown) => {
  readonly unitTestSeconds: number;
  readonly integrationTestSeconds: number;
} = slowTestBudgetUntyped;
export const SLOW_TEST_FIXES: { readonly java: unknown } = SLOW_TEST_FIXES_UNTYPED;
export const isIntegrationTest: (test: { className: string; unitSource: boolean }) => boolean =
  isIntegrationTestUntyped;
export const isSpringBootTest: (
  text: string,
  context: { locate: Locate; projectRoot: string },
) => boolean = isSpringBootTestUntyped;
export const isUnitTestTask: (task: string) => boolean = isUnitTestTaskUntyped;
export const sourceOf: (locate: Locate, className: string) => string | undefined = sourceOfUntyped;
export const DECLARES_KOTEST_SPEC: RegExp = DECLARES_KOTEST_SPEC_UNTYPED;
