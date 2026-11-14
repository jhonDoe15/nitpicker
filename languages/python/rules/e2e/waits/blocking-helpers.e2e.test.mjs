import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'blocking-helper-in-async';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('blocking-helper-in-async', () => {
  it('reports a plain helper that blocks, called from an async function', () => {
    const [actual, expected] = outcomes([
      [
        'a helper calling requests, a nested helper, a method and an alias',
        'import time\nimport requests as http\n\n\ndef fetch(url):\n    return http.get(url, timeout=5).json()\n\n\ndef twice(url):\n    fetch(url)\n    return fetch(url)\n\n\ndef pause():\n    time.sleep(1)\n\n\nclass Client:\n    def load(self, url):\n        return http.post(url, timeout=5)\n\n    async def run(self, url):\n        self.load(url)\n\n\nasync def handler(url):\n    twice(url)\n    pause()\n',
        [
          `${RULE}:23 load calls requests.post`,
          `${RULE}:27 twice calls requests.get`,
          `${RULE}:28 pause calls time.sleep`,
        ],
      ],
      [
        'the last definition, a base class method, cls and ClassName calls, one finding per line and helper',
        'import requests\nimport time\n\n\ndef f():\n    time.sleep(1)\n\n\ndef f():\n    requests.get("x", timeout=5)\n\n\nclass Base:\n    def load(self):\n        requests.get("x", timeout=5)\n\n    @classmethod\n    def make(cls):\n        requests.get("x", timeout=5)\n\n\nclass Child(Base):\n    async def run(self):\n        self.load()\n        Base.make()\n        f(), f()\n',
        [
          `${RULE}:24 load calls requests.get`,
          `${RULE}:25 make calls requests.get`,
          `${RULE}:26 f calls requests.get`,
        ],
      ],
      [
        'four helper levels are one too many',
        'import time\n\n\ndef a():\n    time.sleep(1)\n\n\ndef b():\n    a()\n\n\ndef c():\n    b()\n\n\ndef d():\n    c()\n\n\nasync def run():\n    c()\n    d()\n',
        [`${RULE}:21 c calls time.sleep`],
      ],
      [
        'a helper imported from another module',
        {
          files: {
            'helpers.py':
              'import subprocess\n\n\ndef run(args):\n    return subprocess.run(args, timeout=5, check=True)\n',
            'mod.py':
              'from k3.helpers import run\n\n\nasync def build(args):\n    return run(args)\n',
          },
        },
        [`${RULE}:5 run calls subprocess.run`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes offloaded helpers, async helpers, direct calls and non-blocking helpers', () => {
    const [actual, expected] = outcomes([
      [
        'to_thread, run_in_executor, a lambda, an async helper and a decorated helper',
        'import asyncio\nimport functools\nimport requests\n\n\ndef fetch(url):\n    return requests.get(url, timeout=5).json()\n\n\nasync def afetch(client, url):\n    return await client.get(url)\n\n\n@functools.cache\ndef cached(url):\n    return requests.get(url, timeout=5)\n\n\ndef parse(text):\n    return text.split()\n\n\nasync def handler(url, client):\n    loop = asyncio.get_running_loop()\n    await asyncio.to_thread(fetch, url)\n    await loop.run_in_executor(None, fetch, url)\n    await loop.run_in_executor(None, lambda: fetch(url))\n    await afetch(client, url)\n    cached(url)\n    return parse(url)\n',
        [],
      ],
      [
        'a shadowed helper, a rebound API name, a generator helper, sleep(0) and an unfollowed init',
        'import requests\nimport time\n\n\ndef f():\n    requests.get("x", timeout=5)\n\n\ndef g(requests):\n    requests.get("x")\n\n\ndef h(client):\n    requests = client\n    requests.get("x")\n\n\ndef gen():\n    requests.get("x", timeout=5)\n    yield 1\n\n\ndef zero():\n    time.sleep(0)\n\n\nclass A:\n    def __init__(self):\n        requests.get("x", timeout=5)\n\n\nasync def a(f, client):\n    f()\n    g(client)\n    h(client)\n    gen()\n    zero()\n    A()\n    k = lambda: 1\n    k()\n\n    def f2():\n        return 1\n\n    f2()\n',
        [],
      ],
      [
        'a sync function that is not called from async code',
        'import requests\n\n\ndef fetch(url):\n    return requests.get(url, timeout=5)\n\n\ndef main(url):\n    return fetch(url)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
