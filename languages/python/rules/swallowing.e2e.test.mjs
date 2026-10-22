import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from './test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

const { cleanup, single } = createScripts();
afterEach(cleanup);

const LOGGERS = [
  'import logging',
  'import sys',
  'import traceback',
  'import warnings',
  'logger = logging.getLogger(__name__)',
  'audit = logging.getLogger("audit")',
  '',
  '',
  '',
].join('\n');

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
    ['return an empty built-in', '            return dict()'],
    ['return a parameter', '            return fallback'],
    ['return a module constant', '            return DEFAULT'],
    ['return an attribute', '            return self.default'],
    ['return a list holding a name', '            return [fallback]'],
    ['assign a constant', '            result = 1'],
    ['assign None', '            result = None'],
    ['assign a name', '            result = fallback'],
    ['assign a constant to an attribute', '            self.cache = False'],
    ['assign an annotated constant', '            result: int = 0'],
    ['count', '            counter += 1'],
    ['count then continue', '            counter += 1\n            continue'],
    ['collect the item without the error', '            failures.append(item)'],
    ['collect a constant', '            failures.add(None)'],
    ['log the error', '            logger.exception("bad")'],
    ['log the error with its message', '            logger.warning("bad %s: %s", item, error)'],
    ['log with the traceback', '            logger.error("bad", exc_info=True)'],
    ['log a warning', '            logger.warning("bad %s", item)'],
    ['log through logging', '            logging.error("bad")'],
    ['log through a getLogger call', '            logging.getLogger(__name__).exception("bad")'],
    ['log through a bound logger', '            audit.info("bad")'],
    ['log then pass', '            logger.warning("bad")\n            pass'],
    ['log then continue', '            logger.warning("bad")\n            continue'],
    ['log then return None', '            logger.warning("bad")\n            return None'],
    ['log then count', '            logger.warning("bad")\n            counter += 1'],
    ['log then return a name', '            logger.warning("bad")\n            return fallback'],
    [
      'log the message built from the error',
      '            message = str(error)\n            logger.warning(message)',
    ],
    ['print the error', '            print("bad")'],
    ['print the error value', '            print(error)'],
    ['write to standard error', '            sys.stderr.write("bad")'],
    ['warn', '            warnings.warn("bad")'],
    ['print the traceback', '            traceback.print_exc()'],
    ['call a helper that only logs', '            ignore(error)'],
  ])('flags a handler that only does %s', (_name, body) => {
    const code = `${LOGGERS}def ignore(error):\n    logger.warning("ignored %s", error)\n\n\n${tryBlock('except ValueError as error:', body)}`;

    expect(single(code)).toEqual(['swallowed-exception src/mod.py:17 except ValueError']);
  });

  it.each([
    ['logs and re-raises', '            logger.exception("bad")\n            raise'],
    [
      'logs and raises another error',
      '            logger.warning("bad")\n            raise Other(item)',
    ],
    ['logs and calls an action', '            logger.warning("bad")\n            report(item)'],
    [
      'logs and collects the error',
      '            logger.warning("bad")\n            errors.append(error)',
    ],
    ['re-raises', '            raise'],
    ['raises another error', '            raise OtherError(item) from error'],
    ['returns the error text', '            return str(error)'],
    ['returns a failure result', '            return Rejected(item)'],
    ['returns a failure result carrying the error', '            return Rejected(item, error)'],
    ['returns a dict holding a call', '            return {"error": str(item)}'],
    ['returns a response', '            return jsonify(error="bad"), 500'],
    ['assigns a computed value', '            result = default(item)'],
    ['collects the item with the error', '            failures.append((item, error))'],
    ['collects the error text', '            failures.append(str(error))'],
    ['stores the error', '            self.last_error = error'],
    ['stores the error text in a mapping', '            report["error"] = str(error)'],
    ['hands the error to a function', '            fail(error)'],
    [
      'hands a message built from the error on',
      '            message = f"bad {error}"\n            notify(message)',
    ],
    ['keeps the error for later', '            failure = error'],
    ['exits', '            sys.exit(1)'],
    ['calls a recovery', '            recover()'],
    ['breaks', '            break'],
  ])('allows a handler that %s', (_name, body) => {
    const after = body.includes('failure = error')
      ? '        if failure:\n            raise failure\n'
      : '';
    const code = `${LOGGERS}${tryBlock('except ValueError as error:', body)}${after}`;

    expect(single(code)).toEqual([]);
  });

  it.each([
    ['assigns None', '            tomllib = None'],
    ['imports the alternative', '            import tomli as tomllib'],
    ['imports from the alternative', '            from yaml import SafeLoader as Loader'],
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
    [
      'import contextlib\n\nIGNORED = (OSError, Exception)\nwith contextlib.suppress(*IGNORED):\n    f()\n',
      'contextlib.suppress(*IGNORED)',
      4,
    ],
  ])('flags %j', (code, subject, line = 3) => {
    expect(single(code)).toEqual([`blind-suppress src/mod.py:${String(line)} ${subject}`]);
  });

  it.each([
    'import contextlib\n\nwith contextlib.suppress(KeyError):\n    f()\n',
    'import contextlib\n\nwith contextlib.suppress(OSError, ValueError):\n    f()\n',
    'import contextlib\n\nwith contextlib.suppress(*ERRORS):\n    f()\n',
    'import contextlib\n\nERRORS = (KeyError,)\nwith contextlib.suppress(*ERRORS):\n    f()\n',
    'from mylib import suppress\n\nwith suppress(Exception):\n    f()\n',
    'import contextlib\n\nwith contextlib.closing(Exception):\n    f()\n',
  ])('allows %j', (code) => {
    expect(single(code)).toEqual([]);
  });
});
