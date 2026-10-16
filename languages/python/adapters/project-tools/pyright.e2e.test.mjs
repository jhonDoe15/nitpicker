import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { realTypeFindings, removeTemporaryRoots } from './test-support/real-type-check.mjs';

const TYPE_ERROR = 'def double(value: int) -> str:\n    return value\n';
const WEAKENING = {
  'pyrightconfig.json': '{ "typeCheckingMode": "off", "reportReturnType": "none" }\n',
};
const LISTED = { pyright: ['project', 'nitpicker'] };

afterEach(removeTemporaryRoots);

describe.skipIf(!pythonE2eEnabled)('pyright with the project config end to end', () => {
  const files = { 'src/demo.py': TYPE_ERROR, ...WEAKENING };

  it('stays strict when the project config weakens the checks', () => {
    expect(realTypeFindings({ files, checker: 'pyright' })).toEqual(['reportReturnType demo.py']);
  });

  it('takes the weakening when the project is listed', () => {
    expect(realTypeFindings({ files, checker: 'pyright', toolPrecedence: LISTED })).toEqual([]);
  });

  it('keeps the strict settings the project config does not set', () => {
    const untyped = {
      'src/demo.py': 'def f(x):\n    return x\n',
      'pyrightconfig.json': '{ "reportReturnType": "none" }\n',
    };

    expect(
      realTypeFindings({ files: untyped, checker: 'pyright', toolPrecedence: LISTED }).sort(),
    ).toEqual([
      'reportMissingParameterType demo.py',
      'reportUnknownParameterType demo.py',
      'reportUnknownParameterType demo.py',
      'reportUnknownVariableType demo.py',
    ]);
  });

  it('checks against the python version of the config without the opt-in', () => {
    const versioned = {
      'src/demo.py': 'match 1:\n    case _:\n        pass\n',
      'pyrightconfig.json': '{ "pythonVersion": "3.9" }\n',
    };

    expect(realTypeFindings({ files: versioned, checker: 'pyright' })).toEqual([
      'type-error demo.py',
    ]);
  });
});
