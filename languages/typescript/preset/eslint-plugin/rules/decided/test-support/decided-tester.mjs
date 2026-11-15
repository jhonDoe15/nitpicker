import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';

export function decidedTester() {
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
  function typed(code, errors) {
    const file = path.join(root, `src/case-${randomUUID()}.ts`);
    writeFileSync(file, code);
    return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
  }
  function error(messageId, condition, reason) {
    return { messageId, data: { condition, reason } };
  }
  return { tester, typed, error };
}
