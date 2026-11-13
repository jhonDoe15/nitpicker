import type TypeScript from 'typescript';
import type { Finding } from '../../static-checks/shared.mts';
import type { EslintOptions } from '../arguments.mts';
import {
  metricGrowth as untypedMetricGrowth,
  routedEslintFields as untypedRoutedEslintFields,
  withoutFatalDirectives as untypedWithoutFatalDirectives,
} from '../../hints/eslint-hints.mjs';
import { growthAdviceFor as untypedGrowthAdviceFor } from '../../hints/growth-advice.mjs';
import {
  testEnvironmentNotices as untypedTestEnvironmentNotices,
  testEnvironmentsFor as untypedTestEnvironmentsFor,
} from '../../../preset/test-environment/resolve-environment.mjs';

export type EslintFinding = Finding & {
  allowedForm?: string;
  anchor?: { readonly key: string };
  ratchet?: Readonly<Record<string, unknown>>;
};

type MessageHint = {
  readonly ruleId: string;
  readonly text: string;
  readonly relativePath: string;
  readonly node: TypeScript.Node | undefined;
  readonly sourceFile: TypeScript.SourceFile;
};

export type TestEnvironments = {
  readonly environment?: unknown;
  readonly scopes?: unknown;
  readonly aliases?: unknown;
  readonly setupFiles?: unknown;
  readonly notice?: { readonly path: string; readonly message: string };
};

export const metricGrowth: (
  finding: Pick<Finding, 'rule' | 'path' | 'symbol'>,
  plan: { readonly label: string; readonly value: number },
) => { readonly worseMessage: string; readonly worseAllowedForm: string } = untypedMetricGrowth;

export const routedEslintFields: (options: MessageHint) => {
  readonly message: string;
  readonly allowedForm?: string;
} = untypedRoutedEslintFields;

export const withoutFatalDirectives: (messages: readonly unknown[]) => unknown[] =
  untypedWithoutFatalDirectives;

export const growthAdviceFor: (
  ruleId: string,
) => { readonly growthAdvice: string; readonly growthAllowedForm: string } | undefined =
  untypedGrowthAdviceFor;

export type EslintMessage = {
  readonly ruleId?: unknown;
  readonly messageId?: unknown;
  readonly message?: unknown;
  readonly fatal?: unknown;
  readonly line?: unknown;
  readonly column?: unknown;
  readonly endLine?: unknown;
  readonly endColumn?: unknown;
};

type EslintResult = { readonly filePath?: unknown; readonly messages?: unknown };

export function isFieldRecord(value: unknown): value is EslintMessage & EslintResult {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const testEnvironmentsFor: (options: EslintOptions) => TestEnvironments =
  untypedTestEnvironmentsFor;

export const testEnvironmentNotices: (request: {
  readonly testEnvironments: TestEnvironments;
  readonly analyzerName: string;
}) => Finding[] = untypedTestEnvironmentNotices;
