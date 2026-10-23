import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('compatibility-shim', () => {
  it('flags a module __getattr__, a deprecation warning, a deprecated marker and an alias', () => {
    const [actual, expected] = outcomes([
      [
        'a module __getattr__',
        'def __getattr__(name: str) -> object:\n    raise AttributeError(name)\n',
        ['compatibility-shim:1 __getattr__'],
      ],
      [
        'an async module __getattr__ is not a thing, a method is fine',
        'class Lazy:\n    def __getattr__(self, name: str) -> object:\n        raise AttributeError(name)\n',
        [],
      ],
      [
        'a DeprecationWarning as the second argument',
        'import warnings\n\n\ndef old() -> None:\n    warnings.warn("use new", DeprecationWarning, stacklevel=2)\n',
        ['compatibility-shim:5 warnings.warn(DeprecationWarning)'],
      ],
      [
        'a PendingDeprecationWarning as the category keyword',
        'import warnings\n\n\ndef old() -> None:\n    warnings.warn("use new", category=PendingDeprecationWarning)\n',
        ['compatibility-shim:5 warnings.warn(DeprecationWarning)'],
      ],
      [
        'warn imported by name and a project warning class',
        'from warnings import warn\n\nfrom .errors import OrderDeprecationWarning\n\n\ndef old() -> None:\n    warn("use new", OrderDeprecationWarning)\n',
        ['compatibility-shim:7 warnings.warn(DeprecationWarning)'],
      ],
      [
        'typing_extensions.deprecated',
        'from typing_extensions import deprecated\n\n\n@deprecated("use new")\ndef old() -> None:\n    pass\n',
        ['compatibility-shim:4 @deprecated old'],
      ],
      [
        'warnings.deprecated on a class and a method, called or bare',
        'import warnings\n\n\n@warnings.deprecated("use New")\nclass Old:\n    @warnings.deprecated\n    def run(self) -> None:\n        pass\n',
        ['compatibility-shim:4 @deprecated Old', 'compatibility-shim:6 @deprecated run'],
      ],
      [
        'an alias of a class defined in the module',
        'class Order:\n    pass\n\n\nOldOrder = Order\n',
        ['compatibility-shim:5 OldOrder = Order'],
      ],
      [
        'an alias of a function imported from the project',
        'from .billing import charge\n\ncharge_card = charge\n',
        ['compatibility-shim:3 charge_card = charge'],
      ],
      [
        'an alias of an imported name under its alias',
        'from .billing import charge as pay\n\ncharge_card = pay\n',
        ['compatibility-shim:3 charge_card = pay'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves other warnings, other assignments and tests alone', () => {
    const [actual, expected] = outcomes([
      [
        'a runtime warning and a user warning',
        'import warnings\n\n\ndef run() -> None:\n    warnings.warn("careful", RuntimeWarning)\n    warnings.warn("careful")\n    warnings.simplefilter("ignore", DeprecationWarning)\n',
        [],
      ],
      ['a dunder alias', 'from ._version import version\n\n__version__ = version\n', []],
      [
        'an alias of a name that is not defined in the module',
        'import numpy as np\n\nARRAY = np\nMissing = Elsewhere\nsame = same\n',
        [],
      ],
      [
        'an alias of a constant or a call',
        'LIMIT = 10\nMAX = LIMIT\nHandler = make()\nlogger = logging.getLogger(__name__)\n',
        [],
      ],
      [
        'an alias inside a function, an if and a try',
        'try:\n    from yaml import CSafeLoader as Loader\nexcept ImportError:\n    from yaml import SafeLoader\n\n    Loader = SafeLoader\n\n\nif True:\n    from .a import thing\n\n    other = thing\n\n\ndef run() -> None:\n    from .a import item\n\n    alias = item\n',
        [],
      ],
      [
        'an alias in a class body',
        'class Number:\n    def add(self, other: int) -> int:\n        return other\n\n    __radd__ = add\n    plus = add\n',
        [],
      ],
      [
        'a test file',
        inFile(
          'tests/test_mod.py',
          'import warnings\n\n\ndef test_old() -> None:\n    warnings.warn("x", DeprecationWarning)\n    assert helper() == 1\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
