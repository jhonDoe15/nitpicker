import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester, type TypedRuleTester } from '../../../test-support/rule-tester.mts';

type ExpectedError = { messageId: string; data: Record<string, string> };
type TypedCase = { filename: string; code: string };
type TypedCaseWithErrors = TypedCase & { errors: ExpectedError[] };

export function decidedTester(): {
  tester: TypedRuleTester;
  typed: {
    (code: string): TypedCase;
    (code: string, errors: ExpectedError[]): TypedCaseWithErrors;
  };
  error: (messageId: string, condition: string, reason: string) => ExpectedError;
} {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-decided-flow-')));
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        allowJs: true,
        checkJs: true,
        noEmit: true,
        types: [],
        lib: ['ES2022'],
      },
      include: ['src'],
    }),
  );
  mkdirSync(path.join(root, 'src'));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
  function typed(code: string): TypedCase;
  function typed(code: string, errors: ExpectedError[]): TypedCaseWithErrors;
  function typed(code: string, errors?: ExpectedError[]): TypedCase | TypedCaseWithErrors {
    const file = path.join(root, `src/case-${randomUUID()}.ts`);
    writeFileSync(file, code);
    return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
  }
  function error(messageId: string, condition: string, reason: string): ExpectedError {
    return { messageId, data: { condition, reason } };
  }
  return { tester, typed, error };
}
