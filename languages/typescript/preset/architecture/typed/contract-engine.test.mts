import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { nativeCompilerPath } from '../../../adapters/typed-engine/compiler-binary.mts';
import { listOf } from '../../../../../shared/values/readers.mts';
import { analyzePublicContractUsage } from '../public-contract-usage.mts';
import { engineUnusedMethods } from './contract-engine.mts';

const PROJECT = path.resolve(
  import.meta.dirname,
  '../../../../../engine/tests/fixtures/typescript-typed/contracts/tsconfig.json',
);
const WORKSPACE = path.resolve(PROJECT, '../../workspace/tsconfig.json');
const OWN_ROOT = path.resolve(WORKSPACE, '../src/app');
const NODE_ONLY = { ...process.env, NITPICKER_TYPED_ENGINE: 'off' };
const ENGINE = { ...process.env, NITPICKER_TYPED_ENGINE: 'required' };
const hasEngine = findEngine(process.env) !== undefined && nativeCompilerPath() !== undefined;

it('leaves the check to the compiler in this process when the engine is switched off', () => {
  expect(engineUnusedMethods(PROJECT, NODE_ONLY)).toBeUndefined();
});

it('leaves the check to the compiler in this process when the project cannot be read', () => {
  const missing = path.join(path.dirname(PROJECT), 'missing', 'tsconfig.json');

  expect(engineUnusedMethods(missing, process.env)).toBeUndefined();
});

it.runIf(hasEngine)('reports through the engine what the compiler in this process reports', () => {
  const viaEngine = engineUnusedMethods(PROJECT, ENGINE);

  expect(viaEngine?.findings).toEqual(
    analyzePublicContractUsage(PROJECT, { environment: NODE_ONLY }),
  );
  expect(viaEngine?.findings.map(({ contract, method }) => `${contract}.${method}`)).toEqual([
    'Clock.sleep',
    'Store.__reset',
    'Store.onChange',
    'Store.remove',
    'Ticker.stop',
  ]);
  expect(
    analyzePublicContractUsage(PROJECT, {
      displayRoot: path.dirname(PROJECT),
      environment: ENGINE,
    }),
  ).toEqual(
    analyzePublicContractUsage(PROJECT, {
      displayRoot: path.dirname(PROJECT),
      environment: NODE_ONLY,
    }),
  );
});

it.runIf(hasEngine)(
  'counts only the contracts of the own root through the engine, as the compiler in this process does',
  () => {
    const viaEngine = analyzePublicContractUsage(WORKSPACE, {
      displayRoot: OWN_ROOT,
      environment: ENGINE,
    });

    expect(viaEngine).toEqual(
      analyzePublicContractUsage(WORKSPACE, { displayRoot: OWN_ROOT, environment: NODE_ONLY }),
    );
    expect(viaEngine).toEqual([{ file: 'ports.ts', contract: 'Repository', method: 'save' }]);
    expect(engineUnusedMethods(WORKSPACE, ENGINE)?.findings.map(({ method }) => method)).toEqual([
      'log',
      'trace',
      'save',
      'flush',
    ]);
  },
);

it.runIf(hasEngine)(
  'keeps a project with options TypeScript 7 removed on the engine and leaves no config behind',
  () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-contracts-legacy-'));
    try {
      cpSync(path.dirname(PROJECT), root, { recursive: true });
      const consumer = path.join(root, 'src/nested/consumer.ts');
      writeFileSync(consumer, readFileSync(consumer, 'utf8').replace('"../ports"', '"ports"'));
      const config = path.join(root, 'tsconfig.json');
      writeFileSync(
        config,
        JSON.stringify({
          compilerOptions: {
            target: 'es2022',
            module: 'commonjs',
            moduleResolution: 'node',
            baseUrl: 'src',
            strict: true,
            noEmit: true,
            rootDir: 'src',
            types: [],
            lib: ['ES2022'],
          },
          include: ['src'],
        }),
      );

      const viaEngine = engineUnusedMethods(config, ENGINE);

      expect(viaEngine?.findings).toEqual(
        analyzePublicContractUsage(config, { environment: NODE_ONLY }),
      );
      expect(viaEngine?.findings.map(({ contract, method }) => `${contract}.${method}`)).toEqual([
        'Clock.sleep',
        'Store.__reset',
        'Store.onChange',
        'Store.remove',
        'Ticker.stop',
      ]);
      expect(readdirSync(root).toSorted()).toEqual(['src', 'tsconfig.json']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

const stubRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-contracts-stub-'));
afterAll(() => {
  rmSync(stubRoot, { recursive: true, force: true });
});

const stub = path.join(stubRoot, 'engine.mjs');
const seenFile = path.join(stubRoot, 'seen.txt');
writeFileSync(
  stub,
  [
    `#!${process.execPath}`,
    "import { readFileSync, writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    'const value = (flag) => args[args.indexOf(flag) + 1];',
    "const project = value('--project');",
    `writeFileSync(${JSON.stringify(seenFile)}, JSON.stringify([project, readFileSync(project, 'utf8')]));`,
    'const finding = { file: "src/a.ts", contract: "Port", method: "save" };',
    "const checks = { 'public-contracts': { findings: [finding] } };",
    "writeFileSync(value('--out'), JSON.stringify({ checks, sourceRoot: '/project' }));",
  ].join('\n'),
);
chmodSync(stub, 0o755);
const STUB = { ...process.env, NITPICKER_ENGINE: stub, NITPICKER_TYPED_ENGINE: 'required' };

function projectWith(compilerOptions: object): string {
  const root = mkdtempSync(path.join(stubRoot, 'project-'));
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions }));
  return path.join(root, 'tsconfig.json');
}

function seen(): unknown {
  return JSON.parse(readFileSync(seenFile, 'utf8'));
}

describe.skipIf(process.platform === 'win32' || nativeCompilerPath() === undefined)(
  'the engine run of the public contract check',
  () => {
    it('hands a config TypeScript 7 reads as it is', () => {
      const config = projectWith({ strict: true });

      expect(engineUnusedMethods(config, STUB)).toEqual({
        sourceRoot: path.resolve('/project'),
        findings: [{ file: path.join('src', 'a.ts'), contract: 'Port', method: 'save' }],
      });
      expect(seen()).toEqual([config, JSON.stringify({ compilerOptions: { strict: true } })]);
    });

    it('hands a translated config for options TypeScript 7 removed and removes it after', () => {
      const config = projectWith({ baseUrl: 'src' });
      engineUnusedMethods(config, STUB);
      const [project, text] = listOf(seen()).map(String);

      expect(path.dirname(String(project))).toBe(path.dirname(config));
      expect(project).not.toBe(config);
      expect(JSON.parse(String(text))).toMatchObject({ extends: './tsconfig.json' });
      expect(readdirSync(path.dirname(config))).toEqual(['tsconfig.json']);
    });

    it('hands the config as it is when the translated config cannot be written', () => {
      const config = projectWith({ baseUrl: 'src' });
      mkdirSync(
        path.join(
          path.dirname(config),
          `.nitpicker-typescript7-${String(process.pid)}.tsconfig.json`,
        ),
      );
      engineUnusedMethods(config, STUB);

      expect(seen()).toEqual([config, JSON.stringify({ compilerOptions: { baseUrl: 'src' } })]);
    });
  },
);
