import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typescriptRuleTester, type TypedRuleTester } from './rule-tester.mts';

export type CaseError = {
  readonly messageId: string;
  readonly data?: Readonly<Record<string, string>>;
};
export type TypedCase = { filename: string; code: string };
export type InvalidCase = TypedCase & { errors: CaseError[] };

type TypedCases = {
  readonly tester: TypedRuleTester;
  readonly cleanup: () => void;
  readonly typed: {
    (code: string): TypedCase;
    (code: string, errors: CaseError[]): InvalidCase;
  };
};

export function typedCases(
  prefix: string,
  compilerOptions: Readonly<Record<string, unknown>> = {},
): TypedCases {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        types: [],
        lib: ['ES2022'],
        ...compilerOptions,
      },
      include: ['src'],
    }),
  );
  mkdirSync(path.join(root, 'src'));

  function typed(code: string): TypedCase;
  function typed(code: string, errors: CaseError[]): InvalidCase;
  function typed(code: string, errors?: CaseError[]): TypedCase | InvalidCase {
    const filename = path.join(root, `src/case-${randomUUID()}.ts`);
    writeFileSync(filename, code);
    return errors === undefined ? { filename, code } : { filename, code, errors };
  }

  function cleanup(): void {
    rmSync(root, { recursive: true, force: true });
  }

  const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
  return { tester, cleanup, typed };
}
