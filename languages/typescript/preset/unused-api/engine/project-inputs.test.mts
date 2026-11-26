import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { nativeCompilerPath } from '../../../adapters/typed-engine/compiler-binary.mts';
import { analyzeTypedStructure } from '../../design/typed-structure.mts';

const engine = findEngine(process.env);
const hasEngine =
  engine !== undefined && nativeCompilerPath() !== undefined && process.platform !== 'win32';

let root: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-legacy-')));
  const files = {
    'package.json': JSON.stringify({ name: 'fixture', private: true }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES5',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: false,
        lib: ['ES2022'],
        baseUrl: 'src',
        paths: { '@app/*': ['app/*'] },
      },
      include: ['src'],
    }),
    'src/lib/options.ts':
      'export function render(options: { title: string; verbose?: boolean }): string {\n' +
      "  return options.verbose === true ? options.title : '';\n}\n",
    'src/app/name.ts': "export const name = 'app';\n",
    'src/use.ts':
      "import { render } from 'lib/options';\nimport { name } from '@app/name';\n\n" +
      'export const shown = render({ title: name });\n',
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
});

function statusLoggingEngine(): { readonly binary: string; readonly statuses: () => string[] } {
  const log = path.join(root, 'statuses.log');
  const binary = path.join(root, 'engine');
  writeFileSync(log, '');
  writeFileSync(
    binary,
    `#!/bin/sh\n'${engine ?? ''}' "$@"\nstatus=$?\necho $status >> '${log}'\nexit $status\n`,
  );
  chmodSync(binary, 0o755);
  return { binary, statuses: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function typedStructure(environment: NodeJS.ProcessEnv): ReturnType<typeof analyzeTypedStructure> {
  return analyzeTypedStructure({
    projectRoot: root,
    configPath: path.join(root, 'tsconfig.json'),
    environment: { ...process.env, ...environment },
    analyzerName: 'structure',
  });
}

it.runIf(hasEngine)(
  'keeps a project with options TypeScript 7 removed on the engine and reports what Node reports',
  () => {
    const logged = statusLoggingEngine();
    const viaEngine = typedStructure({
      NITPICKER_ENGINE: logged.binary,
      NITPICKER_TYPED_ENGINE: 'required',
    });

    expect(logged.statuses()).toEqual(['0']);
    expect(viaEngine).toEqual(typedStructure({ NITPICKER_TYPED_ENGINE: 'off' }));
    expect(viaEngine['unused-api']).not.toEqual([]);
  },
);
