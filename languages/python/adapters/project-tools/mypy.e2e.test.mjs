import { describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { realTypeFindings } from './test-support/real-type-check.mjs';

const UNTYPED = 'def f(x):\n    return x\n';
const LISTED = { mypy: ['project', 'nitpicker'] };

describe.skipIf(!pythonE2eEnabled)('mypy with the project config end to end', () => {
  const sections = {
    'src/shop/__init__.py': UNTYPED,
    'mypy.ini': [
      '[mypy]',
      'disallow_untyped_defs = False',
      '[mypy-shop.*]',
      'ignore_errors = True',
      'follow_imports = skip',
      '',
    ].join('\n'),
  };

  it('keeps checking the own modules a project config tries to silence', () => {
    expect(realTypeFindings({ files: sections, checker: 'mypy' })).toEqual([
      'no-untyped-def __init__.py',
    ]);
  });

  it('takes the project sections when the project is listed', () => {
    expect(realTypeFindings({ files: sections, checker: 'mypy', toolPrecedence: LISTED })).toEqual(
      [],
    );
  });

  it('keeps strict for the options the project config does not set', () => {
    const files = {
      'src/shop/__init__.py': UNTYPED,
      'mypy.ini': '[mypy]\nwarn_return_any = False\n',
    };

    expect(realTypeFindings({ files, checker: 'mypy', toolPrecedence: LISTED })).toEqual([
      'no-untyped-def __init__.py',
    ]);
  });

  it('lets a global option of the project win over strict when it is listed', () => {
    const files = {
      'src/shop/__init__.py': UNTYPED,
      'pyproject.toml': '[tool.mypy]\ndisallow_untyped_defs = false\n',
    };

    expect(realTypeFindings({ files, checker: 'mypy' })).toEqual(['no-untyped-def __init__.py']);
    expect(realTypeFindings({ files, checker: 'mypy', toolPrecedence: LISTED })).toEqual([]);
  });

  it('keeps an inline (?x) exclude of the project working next to the nitpicker exclude', () => {
    const files = {
      'src/shop/core.py': UNTYPED,
      'src/legacy/old.py': UNTYPED,
      'src/gen/made.py': UNTYPED,
      'mypy.ini': '[mypy]\nexclude = (?x)(\n    ^src/legacy/\n  )\n',
    };

    expect(
      realTypeFindings({ files, checker: 'mypy', toolPrecedence: LISTED, exclude: ['src/gen/**'] }),
    ).toEqual(['no-untyped-def core.py']);
  });

  it('keeps checking a package that only the mypy_path of the project reaches', () => {
    const files = {
      'src/shop/core.py': 'import vendored.impl\n\nVALUE = vendored.impl.f\n',
      'lib/vendored/__init__.py': '',
      'lib/vendored/impl.py': UNTYPED,
      'mypy.ini': '[mypy]\nmypy_path = lib\n[mypy-vendored.*]\nfollow_imports = silent\n',
    };

    expect(realTypeFindings({ files, checker: 'mypy' })).toEqual(['no-untyped-def impl.py']);
    expect(realTypeFindings({ files, checker: 'mypy', toolPrecedence: LISTED })).toEqual([]);
  });
});
