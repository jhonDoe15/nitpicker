import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../core/fix/test-support/fix-project.mjs';

const { fix } = useFixProject();

const RESTATING = "/** Gets the user name. */\nexport function getUserName() {\n  return 'a';\n}\n";
const KEPT = '/**\n * Seconds before the session expires.\n */\nexport const timeout = 60;\n';
const NODE_MODULES = path.join(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  'node_modules',
);

describe('nitpicker --fix with the TypeScript doc comment recipe', () => {
  it('deletes a restating doc comment and lists it under Fixed findings', () => {
    const result = fix({
      committed: {
        'src/main/placeholder.ts': 'export const placeholder = 1;\n',
        'tests/placeholder.ts': 'export const placeholder = true;\n',
      },
      prepare: (root) => {
        symlinkSync(NODE_MODULES, path.join(root, 'node_modules'), 'dir');
      },
      changed: { 'src/main/user.ts': RESTATING, 'src/main/kept.ts': KEPT },
    });

    expect(
      {
        exitCode: result.exitCode,
        report: fixReport(result.stdout),
        user: result.read('src/main/user.ts'),
        kept: result.read('src/main/kept.ts'),
      },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: `Fixed files:
src/main/user.ts
Fixed findings:
  src/main/user.ts:1 eslint/nitpicker/no-comments (typescript-restating-doc-comment)
Fix notes:
  --fix could not verify the fixes: no analyzer reports the fixed rules
`,
      user: "export function getUserName() {\n  return 'a';\n}\n",
      kept: KEPT,
    });
  });
});
