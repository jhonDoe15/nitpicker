import { afterEach, describe, expect, it } from 'vitest';
import { removeScripts, single } from './script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

afterEach(removeScripts);

describe.skipIf(!enabled)('swallowed-exception', () => {
  const tryBlock = (header, body) =>
    `def f(items):\n    for item in items:\n        try:\n            g(item)\n        ${header}\n${body}\n`;
  const inHandler = (body) => tryBlock('except ValueError:', body);

  it.each([
    ['pass', '            pass'],
    ['an ellipsis', '            ...'],
    ['a docstring', '            "ignored"'],
    ['continue', '            continue'],
    ['a bare return', '            return'],
    ['return None', '            return None'],
    ['return False', '            return False'],
    ['return a string', '            return "none"'],
    ['return a negative number', '            return -1'],
    ['pass then return', '            pass\n            return None'],
    ['return an empty tuple', '            return ()'],
    ['return an empty list', '            return []'],
    ['return an empty dict', '            return {}'],
    ['return an empty set display of constants', '            return {1, 2}'],
    ['return a tuple of constants', '            return (None, 0)'],
    ['return a dict of constants', '            return {"a": 1}'],
    ['return a negated constant', '            return not None'],
    ['assign a constant', '            result = 1'],
    ['assign None', '            result = None'],
    ['assign a constant to an attribute', '            self.cache = False'],
    ['assign an annotated constant', '            result: int = 0'],
  ])('flags a handler that only does %s', (_name, body) => {
    expect(single(inHandler(body))).toEqual(['swallowed-exception src/mod.py:5 except ValueError']);
  });

  it.each([
    ['logs the error', '            logger.exception("bad")'],
    ['re-raises', '            raise'],
    ['raises another error', '            raise OtherError(item) from error'],
    ['uses the bound name', '            return str(error)'],
    ['returns a computed value', '            return default(item)'],
    ['returns a name', '            return fallback'],
    ['assigns a name', '            result = fallback'],
    ['assigns a computed value', '            result = default(item)'],
    ['returns a list holding a name', '            return [fallback]'],
    ['returns a dict holding a call', '            return {"error": str(item)}'],
    ['passes after logging', '            logger.warning("bad")\n            pass'],
    ['handles then continues', '            counter += 1\n            continue'],
    ['breaks', '            break'],
  ])('allows a handler that %s', (_name, body) => {
    expect(single(inHandler(body))).toEqual([]);
  });

  it.each([
    ['assigns None', '            tomllib = None'],
    ['assigns False', '            HAS_YAML = False'],
    ['assigns several constants', '            yaml = None\n            HAS_YAML = False'],
  ])('allows an optional import that %s', (_name, body) => {
    expect(single(tryBlock('except ImportError:', body))).toEqual([]);
    expect(single(tryBlock('except ModuleNotFoundError:', body))).toEqual([]);
    expect(single(tryBlock('except (ImportError, ModuleNotFoundError):', body))).toEqual([]);
  });

  it.each([
    ['pass', 'except ImportError:', '            pass', 'except ImportError'],
    ['return None', 'except ImportError:', '            return None', 'except ImportError'],
    [
      'an assignment next to another error',
      'except (ImportError, ValueError):',
      '            tomllib = None',
      'except (ImportError, ValueError)',
    ],
    [
      'an assignment under except Exception',
      'except Exception:',
      '            tomllib = None',
      'except Exception',
    ],
  ])('still flags an import error handler that does only %s', (_name, header, body, subject) => {
    expect(single(tryBlock(header, body))).toEqual([`swallowed-exception src/mod.py:5 ${subject}`]);
  });

  it.each([
    ['a bare except', 'except:', 'except'],
    ['a tuple of errors', 'except (ValueError, KeyError):', 'except (ValueError, KeyError)'],
    ['a dotted error', 'except errors.Bad:', 'except errors.Bad'],
    ['an error computed by a call', 'except errors():', 'except expression'],
    ['a bound name that stays unused', 'except ValueError as error:', 'except ValueError'],
  ])('names the caught error for %s', (_name, header, subject) => {
    expect(single(tryBlock(header, '            pass'))).toEqual([
      `swallowed-exception src/mod.py:5 ${subject}`,
    ]);
  });

  it('flags each swallowing handler of a try and handlers nested in handlers', () => {
    const code =
      'try:\n    a()\nexcept A:\n    pass\nexcept B:\n    try:\n        b()\n    except C:\n        return None\n    raise\n';

    expect(single(code)).toEqual([
      'swallowed-exception src/mod.py:3 except A',
      'swallowed-exception src/mod.py:8 except C',
    ]);
  });

  it('flags the handlers of an except* group and of async code', () => {
    expect(single('try:\n    a()\nexcept* ValueError:\n    pass\n')).toEqual([
      'swallowed-exception src/mod.py:3 except ValueError',
    ]);
    expect(
      single('async def f():\n    try:\n        await a()\n    except OSError:\n        pass\n'),
    ).toEqual(['swallowed-exception src/mod.py:4 except OSError']);
  });

  it('applies to test files too', () => {
    expect(single(inHandler('            pass'), 'tests/test_mod.py')).toEqual([
      'swallowed-exception tests/test_mod.py:5 except ValueError',
    ]);
  });
});

describe.skipIf(!enabled)('blind-suppress', () => {
  it.each([
    [
      'import contextlib\n\nwith contextlib.suppress(Exception):\n    f()\n',
      'contextlib.suppress(Exception)',
    ],
    [
      'import contextlib\n\nwith contextlib.suppress(BaseException):\n    f()\n',
      'contextlib.suppress(BaseException)',
    ],
    ['import contextlib\n\nwith contextlib.suppress():\n    f()\n', 'contextlib.suppress()'],
    [
      'from contextlib import suppress\n\nwith suppress(Exception):\n    f()\n',
      'contextlib.suppress(Exception)',
    ],
    [
      'from contextlib import suppress as ignore\n\nwith ignore(OSError, Exception):\n    f()\n',
      'contextlib.suppress(OSError, Exception)',
    ],
    [
      'import contextlib as c\n\nwith c.suppress(Exception):\n    f()\n',
      'contextlib.suppress(Exception)',
    ],
    [
      'import contextlib\n\nignored = contextlib.suppress(builtins.Exception)\n',
      'contextlib.suppress(builtins.Exception)',
    ],
  ])('flags %j', (code, subject) => {
    expect(single(code)).toEqual([`blind-suppress src/mod.py:3 ${subject}`]);
  });

  it.each([
    'import contextlib\n\nwith contextlib.suppress(KeyError):\n    f()\n',
    'import contextlib\n\nwith contextlib.suppress(OSError, ValueError):\n    f()\n',
    'import contextlib\n\nwith contextlib.suppress(*ERRORS):\n    f()\n',
    'from mylib import suppress\n\nwith suppress(Exception):\n    f()\n',
    'import contextlib\n\nwith contextlib.closing(Exception):\n    f()\n',
  ])('allows %j', (code) => {
    expect(single(code)).toEqual([]);
  });
});
