import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester, type TypedRuleTester } from '../rule-tester.mts';

type TypedTsOptions = {
  lib?: string[];
  prepare?: (root: string) => void;
};

type TypedTsProject = {
  root: string;
  tester: TypedRuleTester;
  write: (code: string, extension: 'ts' | 'js') => string;
};

type NamedError = { messageId: string; data: { name: string } };

type NamedProject = {
  root: string;
  tester: TypedRuleTester;
  typed: {
    (code: string, name?: undefined, extension?: 'ts' | 'js'): { filename: string; code: string };
    (
      code: string,
      name: string,
      extension?: 'ts' | 'js',
    ): { filename: string; code: string; errors: NamedError[] };
  };
};

export function typedTsProject(prefix: string, options: TypedTsOptions = {}): TypedTsProject {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        allowJs: true,
        checkJs: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        types: [],
        lib: options.lib ?? ['ES2022'],
      },
      include: ['src'],
    }),
  );
  mkdirSync(path.join(root, 'src'));
  options.prepare?.(root);
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
  function write(code: string, extension: 'ts' | 'js'): string {
    const suffix = extension === 'js' ? 'js' : 'ts';
    const file = path.join(root, `src/case-${randomUUID()}.${suffix}`);
    writeFileSync(file, code);
    return file;
  }
  return { root, tester, write };
}

export function namedErrorProject(prefix: string, messageId: string): NamedProject {
  const { root, tester, write } = typedTsProject(prefix);
  function typed(
    code: string,
    name?: undefined,
    extension?: 'ts' | 'js',
  ): { filename: string; code: string };
  function typed(
    code: string,
    name: string,
    extension?: 'ts' | 'js',
  ): { filename: string; code: string; errors: NamedError[] };
  function typed(code: string, name?: string, extension: 'ts' | 'js' = 'ts') {
    return {
      filename: write(code, extension),
      code,
      ...(name === undefined ? {} : { errors: [{ messageId, data: { name } }] }),
    };
  }
  return { root, tester, typed };
}

type TypedCase = { filename: string; code: string };

type TypedCaseProject<Errors> = {
  root: string;
  tester: TypedRuleTester;
  typed: {
    (body: string): TypedCase;
    (body: string, errors: Errors): TypedCase & { errors: Errors };
  };
};

export function typedCaseProject<Errors>(
  options: TypedTsOptions & { prefix: string; header?: string },
): TypedCaseProject<Errors> {
  const { root, tester, write } = typedTsProject(options.prefix, options);
  function typed(body: string): TypedCase;
  function typed(body: string, errors: Errors): TypedCase & { errors: Errors };
  function typed(body: string, errors?: Errors): TypedCase & { errors?: Errors } {
    const code = `${options.header ?? ''}${body}`;
    return { filename: write(code, 'ts'), code, ...(errors === undefined ? {} : { errors }) };
  }
  return { root, tester, typed };
}
