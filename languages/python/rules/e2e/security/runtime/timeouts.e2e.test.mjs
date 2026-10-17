import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const TIMEOUT = 'http-without-timeout';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((f) => f.startsWith(TIMEOUT)),
    ]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('http-without-timeout: where the session comes from', () => {
  it('follows class attributes, annotated self attributes, dataclass fields and modules', () => {
    const [actual, expected] = outcomes([
      [
        'a class attribute, an annotated self attribute and a dataclass field',
        'from dataclasses import dataclass, field\n\nimport requests\n\n\nclass Api:\n    session = requests.Session()\n\n    def fetch(self, url):\n        return self.session.get(url)\n\n\nclass Typed:\n    def __init__(self) -> None:\n        self.session: requests.Session = requests.Session()\n\n    def fetch(self, url):\n        return self.session.get(url)\n\n\n@dataclass\nclass Holder:\n    session: requests.Session = field(default_factory=requests.Session)\n\n    def fetch(self, url):\n        return self.session.get(url)\n',
        [`${TIMEOUT}:10 session.get`, `${TIMEOUT}:18 session.get`, `${TIMEOUT}:26 session.get`],
      ],
      [
        'a session read as a module attribute',
        {
          files: {
            'modsession/http.py': 'import requests\n\nSESSION = requests.Session()\n',
            'modsession/a.py':
              'from modsession import http\n\n\ndef f(url):\n    return http.SESSION.get(url)\n',
          },
        },
        [`${TIMEOUT}:5 session.get`],
      ],
      [
        'self.session of the calling class, not another class in the module',
        'import requests\n\n\nclass TimeoutSession(requests.Session):\n    def request(self, *args, **kwargs):\n        kwargs.setdefault("timeout", 10)\n        return super().request(*args, **kwargs)\n\n\nclass Uploader:\n    def __init__(self):\n        self.session = requests.Session()\n\n\nclass Poller:\n    def __init__(self):\n        self.session = TimeoutSession()\n\n    def poll(self, url):\n        return self.session.get(url)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a project session only when it sets a timeout', () => {
    const [actual, expected] = outcomes([
      [
        'a factory without a timeout and a bare subclass',
        'import requests\n\n\ndef make_session() -> requests.Session:\n    session = requests.Session()\n    session.headers["User-Agent"] = "app"\n    return session\n\n\nclass ApiSession(requests.Session):\n    pass\n\n\ndef f(url):\n    make_session().get(url)\n    return ApiSession().get(url)\n',
        [`${TIMEOUT}:15 session.get`, `${TIMEOUT}:16 session.get`],
      ],
      [
        'a factory that mounts a timeout adapter, and request bound with a timeout',
        'import functools\n\nimport requests\n\nfrom adapters_pkg import TimeoutAdapter\n\n\ndef make_session():\n    session = requests.Session()\n    session.mount("https://", TimeoutAdapter(timeout=10))\n    return session\n\n\ndef f(url):\n    s = requests.Session()\n    s.request = functools.partial(s.request, timeout=10)\n    s.get(url)\n    return make_session().get(url)\n',
        [],
      ],
      [
        'a mount on another session, a plain HTTPAdapter and partial without a timeout',
        'import functools\n\nimport requests\nfrom requests.adapters import HTTPAdapter\n\n\ndef f(url, other):\n    other.mount("https://", object())\n    s = requests.Session()\n    s.get(url)\n    t = requests.Session()\n    t.mount("https://", HTTPAdapter(max_retries=3))\n    t.get(url)\n    u = requests.Session()\n    u.request = functools.partial(u.request, headers={})\n    return u.get(url)\n',
        [`${TIMEOUT}:10 session.get`, `${TIMEOUT}:13 session.get`, `${TIMEOUT}:16 session.get`],
      ],
      [
        'the same session name mounted in another function',
        'import requests\n\n\ndef configure(session):\n    session.mount("https://", object())\n\n\ndef f(url):\n    session = requests.Session()\n    return session.get(url)\n',
        [`${TIMEOUT}:10 session.get`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('http-without-timeout: clients and values', () => {
  it('flags urllib3, an aiohttp timeout of None, partial and named None timeouts', () => {
    const [actual, expected] = outcomes([
      [
        'urllib3 pools and requests',
        'import urllib3\n\n\ndef f(url):\n    urllib3.PoolManager().request("GET", url)\n    urllib3.request("GET", url)\n    http = urllib3.PoolManager(timeout=None)\n    http.request("GET", url)\n    pool = urllib3.PoolManager(timeout=5)\n    pool.request("GET", url)\n    return urllib3.request("GET", url, timeout=5)\n',
        [`${TIMEOUT}:5 pool.request`, `${TIMEOUT}:6 urllib3.request`, `${TIMEOUT}:8 pool.request`],
      ],
      [
        'aiohttp ClientTimeout without a bound',
        'import aiohttp\n\n\ndef f():\n    aiohttp.ClientTimeout(total=None)\n    aiohttp.ClientTimeout()\n    return aiohttp.ClientTimeout(total=None, connect=5)\n',
        [`${TIMEOUT}:5 aiohttp.ClientTimeout`, `${TIMEOUT}:6 aiohttp.ClientTimeout`],
      ],
      [
        'partial with and without a timeout',
        'import functools\n\nimport requests\n\nfetch = functools.partial(requests.get, headers={"a": "b"})\nbounded = functools.partial(requests.get, timeout=10)\n\n\ndef f(url, session):\n    fetch(url)\n    bounded(url)\n    request = functools.partial(session.request, timeout=10)\n    return request("GET", url)\n',
        [`${TIMEOUT}:10 requests.get`],
      ],
      [
        'TIMEOUT = None, an options dict and getattr',
        'import requests\n\nTIMEOUT = None\n\n\ndef f(url, method):\n    s = requests.Session()\n    s.get(url, timeout=TIMEOUT)\n    options = {"headers": {"a": "b"}}\n    s.get(url, **options)\n    getattr(s, method)(url)\n    return s.get(url, **{"timeout": 5})\n',
        [`${TIMEOUT}:8 session.get`, `${TIMEOUT}:10 session.get`, `${TIMEOUT}:11 session.request`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
