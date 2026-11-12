import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArguments } from '../../../../../languages/typescript/adapters/static-checks/arguments.mjs';
import { runTypecheck } from '../../../../../languages/typescript/adapters/static-checks/typescript.mjs';
import { toolRoot, useStaticCheckFixtures } from './test-support/static-check-fixtures.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { temporaryDirectory, generatedSnapshot } = useStaticCheckFixtures();
const POLICY_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';

function typecheck(projectConfig) {
  const projectRoot = generatedSnapshot();
  writeFiles(projectRoot, {
    'package.json': '{"name":"config-findings"}\n',
    'src/count.ts': 'export const count: number = "one";\n',
    'tsconfig.json': `${JSON.stringify(projectConfig, null, 2)}\n`,
  });
  const liveProjectRoot = temporaryDirectory('live-config-findings-');
  writeFiles(liveProjectRoot, { 'package.json': '{"name":"config-findings"}\n' });
  symlinkSync(path.join(toolRoot, 'node_modules'), path.join(liveProjectRoot, 'node_modules'));
  return runTypecheck(
    parseArguments([
      '--analyzer-name',
      'typescript-typecheck',
      '--kind',
      'typecheck',
      '--project-root',
      projectRoot,
      '--live-project-root',
      liveProjectRoot,
      '--policy-root',
      toolRoot,
      '--config',
      POLICY_CONFIG,
      '--tool-root',
      toolRoot,
    ]),
  );
}

const OPTIONS = { types: [], lib: ['ES2022'], skipLibCheck: true };

describe('type check config diagnostics', () => {
  it("name the project's tsconfig, and an unknown option keeps the type check running", async () => {
    const findings = await typecheck({
      compilerOptions: { ...OPTIONS, target: 'ES5', fooBar: true },
      include: ['src'],
    });

    expect(findings.map(({ rule, path, location }) => ({ rule, path, location }))).toEqual([
      { rule: 'TS5107', path: 'tsconfig.json', location: undefined },
      { rule: 'TS5023', path: 'tsconfig.json', location: { line: 9, column: 5 } },
      { rule: 'TS2322', path: 'src/count.ts', location: { line: 1, column: 14 } },
    ]);
  });

  it('fail the analyzer with the project tsconfig named when the config cannot be used', async () => {
    await expect(
      typecheck({ extends: './missing.json', compilerOptions: OPTIONS, include: ['src'] }),
    ).rejects.toThrow(
      /^TypeScript config tsconfig\.json is invalid: Cannot read file 'missing\.json'/u,
    );
  });
});
