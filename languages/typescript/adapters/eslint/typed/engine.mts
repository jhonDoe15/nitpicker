import type { Finding } from '../../static-checks/shared.mts';
import type { EslintOptions } from '../arguments.mts';
import {
  testEnvironmentNotices as untypedTestEnvironmentNotices,
  testEnvironmentsFor as untypedTestEnvironmentsFor,
} from '../../../preset/test-environment/resolve-environment.mjs';

export type EslintFinding = Finding & {
  allowedForm?: string;
  anchor?: { readonly key: string };
  ratchet?: Readonly<Record<string, unknown>>;
};

export type TestEnvironments = {
  readonly environment?: unknown;
  readonly scopes?: unknown;
  readonly aliases?: unknown;
  readonly setupFiles?: unknown;
  readonly notice?: { readonly path: string; readonly message: string };
};

export type EslintMessage = {
  readonly ruleId?: unknown;
  readonly messageId?: unknown;
  readonly message?: unknown;
  readonly fatal?: unknown;
  readonly line?: unknown;
  readonly column?: unknown;
  readonly endLine?: unknown;
  readonly endColumn?: unknown;
  readonly chainUses?: number;
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
