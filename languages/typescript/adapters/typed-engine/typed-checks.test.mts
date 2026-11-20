import path from 'node:path';
import { expect, it } from 'vitest';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { nativeCompilerPath } from './compiler-binary.mts';
import { runTypedChecks } from './typed-checks.mts';

const REQUEST = { project: '/nowhere/tsconfig.json', checks: ['public-contracts'] };

it('answers nothing when the typed engine is switched off', () => {
  expect(runTypedChecks({ ...REQUEST, environment: { NITPICKER_TYPED_ENGINE: 'off' } })).toEqual({
    unavailable: 'NITPICKER_TYPED_ENGINE=off',
  });
});

it('answers nothing when there is no engine binary', () => {
  expect(runTypedChecks({ ...REQUEST, environment: { NITPICKER_ENGINE: 'off' } })).toEqual({
    unavailable: 'no engine binary',
  });
});

it('fails when the engine is required and there is no binary', () => {
  const environment = { NITPICKER_ENGINE: 'off', NITPICKER_TYPED_ENGINE: 'required' };

  expect(() => runTypedChecks({ ...REQUEST, environment })).toThrow(
    'NITPICKER_TYPED_ENGINE=required, but there is no engine binary',
  );
});

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../engine/tests/fixtures/typescript-typed/contracts/tsconfig.json',
);
const hasEngine = findEngine() !== undefined && nativeCompilerPath() !== undefined;

it.runIf(hasEngine)('gets every named check answered by one engine call', () => {
  const outcome = runTypedChecks({
    project: FIXTURE,
    checks: ['public-contracts', 'unused-api'],
    inputs: { 'unused-api': { react: false, files: {} } },
    environment: { ...process.env, NITPICKER_TYPED_ENGINE: 'required' },
  });

  expect(Object.keys(outcome.checks ?? {})).toEqual(['public-contracts', 'unused-api']);
  expect(fieldOf(outcome.checks?.['unused-api'], 'targets')).toEqual([]);
});

it.runIf(hasEngine)(
  'fails when the engine is required and it stops on a check it does not know',
  () => {
    const environment = { ...process.env, NITPICKER_TYPED_ENGINE: 'required' };

    expect(() =>
      runTypedChecks({ project: FIXTURE, checks: ['no-such-check'], environment }),
    ).toThrow(/NITPICKER_TYPED_ENGINE=required, but the engine ended with status 2/u);
  },
);

it.runIf(hasEngine)(
  'reports a project the compiler cannot load as unavailable, also when required',
  () => {
    const outcome = runTypedChecks({
      project: path.join(path.dirname(FIXTURE), 'missing', 'tsconfig.json'),
      checks: ['public-contracts'],
      environment: { ...process.env, NITPICKER_TYPED_ENGINE: 'required' },
    });

    expect(outcome.unavailable).toMatch(/does not exist$/u);
  },
);
