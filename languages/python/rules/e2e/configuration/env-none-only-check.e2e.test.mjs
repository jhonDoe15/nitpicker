import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['process-env-access'] });
afterEach(cleanup);

const IMPORT = 'import os\n\n\n';

describe.skipIf(!enabled)('env-none-only-check', () => {
  it('flags an environment variable tested only for None or presence', () => {
    const [actual, expected] = outcomes([
      [
        'is not None on os.environ.get',
        `${IMPORT}def enabled() -> bool:\n    return os.environ.get("API_URL") is not None\n`,
        ['env-none-only-check:5 API_URL'],
      ],
      [
        'is None on os.getenv in an if',
        `${IMPORT}def url() -> str:\n    if os.getenv("API_URL") is None:\n        raise RuntimeError("API_URL")\n    return "x"\n`,
        ['env-none-only-check:5 API_URL'],
      ],
      [
        'a module constant read once',
        `${IMPORT}API_URL = os.getenv("API_URL")\n\n\ndef enabled() -> bool:\n    return API_URL is not None\n`,
        ['env-none-only-check:8 API_URL'],
      ],
      [
        'a membership test',
        `${IMPORT}def enabled() -> bool:\n    return "API_URL" in os.environ\n`,
        ['env-none-only-check:5 API_URL'],
      ],
      [
        'an aliased import',
        'from os import environ, getenv\n\n\ndef enabled() -> bool:\n    return getenv("A") is not None or environ.get("B") is None\n',
        ['env-none-only-check:5 A', 'env-none-only-check:5 B'],
      ],
      [
        'a default that an empty value skips',
        `${IMPORT}def port() -> str:\n    return os.getenv("PORT", "8000") + os.environ.get("HOST", default="localhost")\n`,
        ['env-none-only-check:5 HOST', 'env-none-only-check:5 PORT'],
      ],
      [
        'an emptiness test of another variable',
        `${IMPORT}def enabled() -> bool:\n    return os.getenv("A") is not None and os.getenv("B") != ""\n`,
        ['env-none-only-check:5 A'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves value tests, harmless defaults and test files alone', () => {
    const [actual, expected] = outcomes([
      [
        'truthiness and an or fallback',
        `${IMPORT}def url() -> str:\n    if not os.getenv("API_URL"):\n        raise RuntimeError("API_URL")\n    return os.environ.get("HOST") or "localhost"\n`,
        [],
      ],
      [
        'a None test next to an emptiness test',
        `${IMPORT}def enabled() -> bool:\n    url = os.getenv("API_URL")\n    return url is not None and url.strip() != ""\n`,
        [],
      ],
      [
        'a None test next to a length test',
        `${IMPORT}def enabled() -> bool:\n    return os.getenv("A") is not None and len(os.getenv("A")) > 0\n`,
        [],
      ],
      [
        'an empty or None default',
        `${IMPORT}def read() -> str | None:\n    return os.getenv("A", "") or os.environ.get("B", None)\n`,
        [],
      ],
      [
        'a rebound name and a dynamic key',
        `${IMPORT}def read(name: str) -> bool:\n    url = os.getenv("A")\n    url = "x"\n    return url is not None and os.getenv(name) is not None\n`,
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_mod.py',
          code: `${IMPORT}def test_ci() -> None:\n    assert os.getenv("CI") is not None\n`,
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
