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

function loggingEngine(real: string): { readonly binary: string; readonly calls: () => string[] } {
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-calls-'));
  folders.push(folder);
  const log = path.join(folder, 'calls.log');
  const binary = path.join(folder, 'engine');
  writeFileSync(log, '');
  writeFileSync(binary, `#!/bin/sh\necho "$@" >> '${log}'\nexec '${real}' "$@"\n`);
  chmodSync(binary, 0o755);
  return { binary, calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

function checksOf(call: string): string | undefined {
  return /--checks (?<checks>\S+)/u.exec(call)?.groups?.['checks'];
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
    const counted = loggingEngine(engine ?? '');

    const viaEngine = typedStructureOf(root, {
      NITPICKER_ENGINE: counted.binary,
      NITPICKER_TYPED_ENGINE: 'required',
    });
    const viaNode = typedStructureOf(root, { NITPICKER_TYPED_ENGINE: 'off' });

    expect(counted.calls().map(checksOf)).toEqual(['unused-api,design']);
    expect(viaEngine).toEqual(viaNode);
    expect(
      Object.values(viaEngine).map((findings) => Array.isArray(findings) && findings.length > 0),
    ).toEqual([true, true]);
  },
);

it.runIf(hasEngine)(
  'leaves design signals to Node without asking the engine when a script declares types in comments',
  () => {
    const root = createProject({
      fixture: 'signals',
      files: {
        'src/legacy.mjs':
          '/**\n * @param {{ title: string, verbose?: boolean }} options\n * @returns {string}\n */\n' +
          "export function legacy(options) {\n  return options.verbose === true ? options.title : '';\n}\n",
        'src/use.mjs':
          "import { legacy } from './legacy.mjs';\n\nexport const shown = legacy({ title: 'a' });\n",
      },
    });
    folders.push(root);
    const logged = loggingEngine(engine ?? '');

    const viaEngine = typedStructureOf(root, {
      NITPICKER_ENGINE: logged.binary,
      NITPICKER_TYPED_ENGINE: 'required',
    });

    expect(logged.calls().map(checksOf)).toEqual(['unused-api']);
    expect(viaEngine).toEqual(typedStructureOf(root, { NITPICKER_TYPED_ENGINE: 'off' }));
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

it('reports a failed engine run for the checks that asked it and still runs the others', () => {
  const root = createProject({
    fixture: 'signals',
    files: {
      'src/legacy.mjs':
        '/** @param {string} options */\nexport function shown(options) {\n  return options;\n}\n',
    },
  });
  folders.push(root);
  const outcome = typedStructureOf(root, {
    NITPICKER_ENGINE: 'off',
    NITPICKER_TYPED_ENGINE: 'required',
  });

  expect(outcome['unused-api']).toEqual({
    error: 'NITPICKER_TYPED_ENGINE=required, but there is no engine binary',
  });
  expect(Array.isArray(outcome['design-signals'])).toBe(true);
});

it.runIf(process.platform !== 'win32')('reads the design facts the engine answers', () => {
  const root = createProject({
    files: {
      'src/shown.ts': 'export function shown(options: string): string {\n  return options;\n}\n',
    },
  });
  folders.push(root);
  const stub = path.join(root, 'engine.mjs');
  writeFileSync(
    stub,
    [
      `#!${process.execPath}`,
      "import { writeFileSync } from 'node:fs';",
      'const args = process.argv.slice(2);',
      "const out = args[args.indexOf('--out') + 1];",
      "writeFileSync(out, JSON.stringify({ checks: { design: { types: [], callables: [] }, 'unused-api': {} } }));",
    ].join('\n'),
  );
  chmodSync(stub, 0o755);

  const outcome = typedStructureOf(root, { NITPICKER_ENGINE: stub });

  expect(outcome['design-signals']).toEqual([]);
});
