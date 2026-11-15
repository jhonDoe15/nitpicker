import type { Linter } from 'eslint';
import {
  failureMessagesFor as untypedFailureMessagesFor,
  lintFixture as untypedLintFixture,
} from '../../failure-messages/test-support/harness.mts';

type Fixture = {
  readonly config: readonly object[];
  readonly filename: string;
  readonly code: string;
};

export const lintFixture: (fixture: Fixture) => Linter.LintMessage[] = untypedLintFixture;

export const failureMessagesFor: (fixture: Fixture) => string[] = untypedFailureMessagesFor;
