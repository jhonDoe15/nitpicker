import { expect, it } from 'vitest';
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
