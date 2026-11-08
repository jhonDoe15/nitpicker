import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';

export function typedRegexProject(prefix) {
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

  function written(filename, code, errors) {
    writeFileSync(filename, code);
    return { filename, code, ...(errors === undefined ? {} : { errors }) };
  }

  return {
    tester,
    typed: (code, errors) => written(path.join(root, `src/case-${randomUUID()}.ts`), code, errors),
    typedJs: (code, errors) =>
      written(path.join(root, `src/case-${randomUUID()}.js`), code, errors),
  };
}
