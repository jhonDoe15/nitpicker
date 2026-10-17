import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const HMAC = 'weak-hmac';
const TIMEOUT = 'http-without-timeout';
const LOAD = 'unsafe-deserialization';

describe.skipIf(!enabled)('weak-hmac', () => {
  it('flags HMAC-MD5 and passes HMAC-SHA1 and SHA-256', () => {
    const [actual, expected] = outcomes([
      [
        'hashlib.md5, a string and an import alias',
        'import hashlib\nimport hmac\nfrom hashlib import md5 as legacy\n\n\ndef f(key, msg):\n    hmac.new(key, msg, hashlib.md5)\n    hmac.new(key, msg, digestmod="MD5")\n    return hmac.digest(key, msg, legacy)\n',
        [`${HMAC}:7 hmac.new(md5)`, `${HMAC}:8 hmac.new(md5)`, `${HMAC}:9 hmac.digest(md5)`],
      ],
      [
        'a constant from another module',
        {
          files: {
            'app/algorithms.py': 'DIGEST = "md5"\n',
            'app/sign.py':
              'import hmac\n\nfrom app.algorithms import DIGEST\n\n\ndef f(key, msg):\n    return hmac.new(key, msg, DIGEST)\n',
          },
        },
        [`${HMAC}:7 hmac.new(md5)`],
      ],
      [
        'pycryptodome and cryptography',
        'from Cryptodome.Hash import HMAC, MD5\nfrom cryptography.hazmat.primitives import hashes, hmac\n\n\ndef f(key, msg):\n    HMAC.new(key, msg, digestmod=MD5)\n    return hmac.HMAC(key, hashes.MD5())\n',
        [`${HMAC}:6 HMAC.new(md5)`, `${HMAC}:7 hmac.HMAC(md5)`],
      ],
      [
        'HMAC-SHA1 for TOTP and OAuth 1.0a, and SHA-256',
        'import hashlib\nimport hmac\n\nfrom Cryptodome.Hash import HMAC, SHA1\nfrom cryptography.hazmat.primitives import hashes\nfrom cryptography.hazmat.primitives import hmac as chmac\n\n\ndef f(key, msg):\n    hmac.new(key, msg, hashlib.sha1)\n    hmac.new(key, msg, "sha1")\n    HMAC.new(key, msg, digestmod=SHA1)\n    chmac.HMAC(key, hashes.SHA1())\n    return hmac.new(key, msg, hashlib.sha256)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('http-without-timeout', () => {
  it('flags urllib, plain requests sessions and timeout=None that ruff does not report', () => {
    const [actual, expected] = outcomes([
      [
        'urlopen through an alias and an opener',
        'import urllib.request\nfrom urllib.request import urlopen as fetch\n\n\ndef f(url):\n    fetch(url)\n    return urllib.request.build_opener().open(url)\n',
        [`${TIMEOUT}:6 urllib.request.urlopen`, `${TIMEOUT}:7 opener.open`],
      ],
      [
        'http.client connections',
        'import http.client\n\n\ndef f(host):\n    return http.client.HTTPSConnection(host)\n',
        [`${TIMEOUT}:5 http.client.HTTPSConnection`],
      ],
      [
        'a requests session in a with block, a chain and an attribute',
        'import requests\n\n\nclass Api:\n    def __init__(self):\n        self.http = requests.Session()\n\n    def get(self, url):\n        return self.http.get(url)\n\n\ndef f(url):\n    with requests.Session() as session:\n        session.post(url)\n    return requests.Session().get(url, timeout=None)\n',
        [`${TIMEOUT}:9 session.get`, `${TIMEOUT}:14 session.post`, `${TIMEOUT}:15 session.get`],
      ],
      [
        'an httpx client call with timeout=None',
        'import httpx\n\n\nasync def f(url):\n    async with httpx.AsyncClient() as client:\n        return await client.get(url, timeout=None)\n',
        [`${TIMEOUT}:6 client.get`],
      ],
      [
        'timeouts, defaults and clients that have one',
        'import aiohttp\nimport httpx\nimport requests\nimport urllib.request\n\n\nasync def f(url):\n    urllib.request.urlopen(url, timeout=10)\n    urllib.request.urlopen(url, None, 10)\n    httpx.get(url)\n    with requests.Session() as session:\n        session.get(url, timeout=10)\n    async with httpx.AsyncClient(timeout=10) as client:\n        await client.get(url)\n    async with aiohttp.ClientSession() as http:\n        return await http.get(url)\n',
        [],
      ],
      [
        'a session that mounts an adapter, and a session of the project',
        'import requests\n\n\ndef f(url, adapter, make_session):\n    session = requests.Session()\n    session.mount("https://", adapter)\n    session.get(url)\n    return make_session().get(url)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes urllib when the project sets the socket default timeout', () => {
    const [actual, expected] = outcomes([
      [
        'a project that sets the socket default timeout',
        {
          files: {
            'app/main.py': 'import socket\n\nsocket.setdefaulttimeout(10)\n',
            'app/feeds.py':
              'from urllib.request import urlopen\n\n\ndef f(url):\n    return urlopen(url)\n',
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unsafe-deserialization', () => {
  it('flags the loaders ruff does not report and passes their safe forms', () => {
    const [actual, expected] = outcomes([
      [
        'PyYAML full and unsafe loaders',
        'import yaml\n\n\ndef f(text):\n    yaml.unsafe_load(text)\n    yaml.full_load_all(text)\n    yaml.load_all(text)\n    return yaml.load_all(text, Loader=yaml.FullLoader)\n',
        [
          `${LOAD}:5 yaml.unsafe_load`,
          `${LOAD}:6 yaml.full_load_all`,
          `${LOAD}:7 yaml.load_all`,
          `${LOAD}:8 yaml.load_all`,
        ],
      ],
      [
        'torch, numpy and ruamel',
        'import numpy as np\nimport torch\nfrom ruamel.yaml import YAML\n\n\ndef f(path, text):\n    torch.load(path)\n    torch.load(path, weights_only=False)\n    np.load(path, allow_pickle=True)\n    return YAML(typ="unsafe").load(text)\n',
        [
          `${LOAD}:7 torch.load`,
          `${LOAD}:8 torch.load`,
          `${LOAD}:9 numpy.load`,
          `${LOAD}:10 ruamel.yaml.YAML`,
        ],
      ],
      [
        'the safe forms',
        'import numpy as np\nimport torch\nimport yaml\nfrom ruamel.yaml import YAML\nfrom yaml import CSafeLoader\n\n\nclass StrictLoader(yaml.SafeLoader):\n    pass\n\n\ndef f(path, text):\n    torch.load(path, weights_only=True)\n    np.load(path)\n    yaml.load_all(text, Loader=CSafeLoader)\n    yaml.load_all(text, StrictLoader)\n    yaml.safe_load_all(text)\n    YAML(typ="safe")\n    return YAML()\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
