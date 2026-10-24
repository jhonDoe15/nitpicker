import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../../test-support/rule-tester.mjs';

export function createTypedCases() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-forwarding-wrapper-')));
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        jsx: 'preserve',
        noEmit: true,
        allowJs: true,
        checkJs: true,
        types: [],
        lib: ['ES2022'],
      },
      include: ['src'],
    }),
  );
  mkdirSync(path.join(root, 'src'));
  writeFileSync(
    path.join(root, 'src/api.ts'),
    [
      'export type User = { id: string };',
      "export type UserId = string & { readonly brand: 'UserId' };",
      'export declare function fetchUser(id: string): User;',
      'export declare function fetchUsers(...ids: string[]): User[];',
      'export type Options = { deep: boolean };',
      'export declare function findUser(id: string, options: Options): User;',
      'export declare function fetchWith(id: string, retry?: number): User;',
      'export declare function fetchRetry(id: string, retry: number | undefined): User;',
      'export type Foo = { a: string };',
      'export declare function isObject(value: unknown): boolean;',
      'export declare function assertOk(value: unknown): void;',
      'export declare function useQuery(key: string): User;',
      'export declare function pick<T>(value: T): T;',
      'export declare function overloaded(id: string | number): User;',
      'export declare const api: { fetchUser(id: string): User };',
      '',
    ].join('\n'),
  );

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

  const state = { counter: 0 };

  function writeCase(code, errors, extension) {
    state.counter += 1;
    const file = path.resolve(root, `src/case-${String(state.counter)}.${extension}`);
    if (!file.startsWith(root + path.sep)) {
      throw new Error('Case path must stay inside the temporary project');
    }
    writeFileSync(file, code);
    return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
  }

  function typed(code, errors) {
    return writeCase(code, errors, 'ts');
  }

  function javascriptCase(code, errors) {
    return writeCase(code, errors, 'js');
  }

  return { tester, typed, javascriptCase };
}
