import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { nativeCompilerPath } from '../../../adapters/typed-engine/compiler-binary.mts';
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
