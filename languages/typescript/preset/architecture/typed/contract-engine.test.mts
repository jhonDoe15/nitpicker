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
const NODE_ONLY = { ...process.env, NITPICKER_TYPED_ENGINE: 'off' };
const ENGINE = { ...process.env, NITPICKER_TYPED_ENGINE: 'required' };
const hasEngine = findEngine(process.env) !== undefined && nativeCompilerPath() !== undefined;

it('leaves the check to the compiler in this process when the engine is switched off', () => {
  expect(engineUnusedMethods(PROJECT, NODE_ONLY)).toBeUndefined();
});

it('leaves the check to the compiler in this process when the project cannot be read', () => {
  const missing = path.join(path.dirname(PROJECT), 'missing', 'tsconfig.json');

  expect(engineUnusedMethods(missing)).toBeUndefined();
});

it.runIf(hasEngine)('reports through the engine what the compiler in this process reports', () => {
  const viaEngine = engineUnusedMethods(PROJECT, ENGINE);

  expect(viaEngine?.findings).toEqual(
    analyzePublicContractUsage(PROJECT, { environment: NODE_ONLY }),
  );
  expect(viaEngine?.findings).not.toHaveLength(0);
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
