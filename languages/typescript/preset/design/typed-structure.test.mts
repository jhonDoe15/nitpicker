import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { nativeCompilerPath } from '../../adapters/typed-engine/compiler-binary.mts';
import { createProject, typedStructureOf } from './test-support/project.mts';

const engine = findEngine(process.env);
const hasEngine =
  engine !== undefined && nativeCompilerPath() !== undefined && process.platform !== 'win32';
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function countingEngine(real: string): { readonly binary: string; readonly calls: () => number } {
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-calls-'));
  folders.push(folder);
  const log = path.join(folder, 'calls.log');
  const binary = path.join(folder, 'engine');
  writeFileSync(log, '');
  writeFileSync(binary, `#!/bin/sh\necho "$1" >> '${log}'\nexec '${real}' "$@"\n`);
  chmodSync(binary, 0o755);
  return { binary, calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).length };
}

it.runIf(hasEngine)(
  'asks one engine call for unused API and design signals and reports what the Node checks report',
  () => {
    const root = createProject({
      fixture: 'signals',
      files: {
        'src/options.ts':
          'export function render(options: { title: string; verbose?: boolean }): string {\n' +
          "  return options.verbose === true ? options.title : '';\n}\n",
        'src/use.ts':
          "import { render } from './options';\n\nexport const shown = render({ title: 'a' });\n",
      },
    });
    folders.push(root);
    const counted = countingEngine(engine ?? '');

    const viaEngine = typedStructureOf(root, {
      NITPICKER_ENGINE: counted.binary,
      NITPICKER_TYPED_ENGINE: 'required',
    });
    const viaNode = typedStructureOf(root, { NITPICKER_TYPED_ENGINE: 'off' });

    expect(counted.calls()).toBe(1);
    expect(viaEngine).toEqual(viaNode);
    expect(
      Object.values(viaEngine).map((findings) => Array.isArray(findings) && findings.length > 0),
    ).toEqual([true, true]);
  },
);

it('reports a failed plan for its own check and still runs the other one', () => {
  const root = createProject({ files: { 'tsconfig.json': '{' } });
  folders.push(root);
  const outcome = typedStructureOf(root, { NITPICKER_TYPED_ENGINE: 'off' });
  const failure = outcome['design-signals'];
  expect(outcome['unused-api']).toEqual([]);
  expect(
    typeof failure === 'object' && 'error' in failure ? failure.error.split(':')[0] : failure,
  ).toBe('The TypeScript config could not be read');
});
