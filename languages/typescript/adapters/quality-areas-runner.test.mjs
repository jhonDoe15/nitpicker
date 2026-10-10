import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { parseArguments, runQualityArea } from './quality-areas-runner.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function snapshotWith(files) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  temporaryRoots.push(parent);
  const root = path.join(parent, 'head');
  for (const [file, text] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, text);
  }
  return root;
}

function runKind(kind, projectRoot) {
  return runQualityArea(
    parseArguments([
      '--analyzer-name',
      kind,
      '--kind',
      kind,
      '--project-root',
      projectRoot,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ]),
  );
}

describe('crap runner without a coverage report', () => {
  it('reports a skipped tool error instead of an unknown-coverage finding per function', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts': "import { it } from 'vitest';\nit('x', () => {});\n",
    });

    const findings = await runKind('crap', projectRoot);

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'crap',
        rule: 'tests-failed-skipped',
        classification: 'tool-error',
      }),
    ]);
  });
});
