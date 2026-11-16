import { afterAll } from 'vitest';
import { type CaseError, typedCases } from '../../../test-support/typed-cases.mts';

export type ExpectedError = CaseError;

export function decidedTester(extraOptions: Record<string, string> = {}): Pick<
  ReturnType<typeof typedCases>,
  'tester' | 'typed'
> & {
  error: (messageId: string, condition: string, reason?: string) => ExpectedError;
} {
  const { tester, typed, cleanup } = typedCases('nitpicker-decided-flow-', {
    allowJs: true,
    checkJs: true,
    ...extraOptions,
  });
  afterAll(cleanup);
  function error(messageId: string, condition: string, reason?: string): ExpectedError {
    return { messageId, data: reason === undefined ? { condition } : { condition, reason } };
  }
  return { tester, typed, error };
}
