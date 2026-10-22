import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const TLS = 'tls-verification-off';

describe.skipIf(!enabled)('tls-verification-off', () => {
  it('flags verification turned off by a condition, the environment or a library switch', () => {
    const [actual, expected] = outcomes([
      [
        'verify from a debug flag',
        {
          file: 'settings.py',
          code: 'import os\n\nimport requests\n\nDEBUG = os.environ.get("DEBUG") == "1"\n\n\ndef f(url):\n    return requests.get(url, verify=not DEBUG, timeout=10)\n',
        },
        [`${TLS}:9 requests.get`],
      ],
      [
        'verify from an environment comparison',
        {
          file: 'settings.py',
          code: 'import os\n\nimport httpx\n\n\ndef f():\n    return httpx.Client(verify=os.environ.get("VERIFY_TLS") != "0")\n',
        },
        [`${TLS}:7 httpx.Client`],
      ],
      [
        'verify chosen by a conditional expression',
        'import requests\n\n\ndef f(url, insecure):\n    return requests.post(url, verify=False if insecure else True, timeout=10)\n',
        [`${TLS}:5 requests.post`],
      ],
      [
        'a session and boto3 with verify=False',
        'import boto3\nimport requests\n\n\ndef f(url):\n    session = requests.Session()\n    session.verify = False\n    session.get(url, verify=False, timeout=10)\n    return boto3.client("s3", verify=False)\n',
        [`${TLS}:7 session.verify`, `${TLS}:8 session.get`, `${TLS}:9 boto3.client`],
      ],
      [
        'the ssl module switches',
        'import ssl\n\n\ndef f():\n    context = ssl.create_default_context()\n    context.check_hostname = False\n    context.verify_mode = ssl.CERT_NONE\n    ssl._create_default_https_context = ssl._create_unverified_context\n    return context\n',
        [
          `${TLS}:6 check_hostname`,
          `${TLS}:7 verify_mode`,
          `${TLS}:8 ssl._create_unverified_context`,
        ],
      ],
      [
        'urllib3, aiohttp and websocket options',
        'import aiohttp\nimport urllib3\n\n\ndef f(url, ws):\n    urllib3.PoolManager(cert_reqs="CERT_NONE")\n    aiohttp.TCPConnector(ssl=False)\n    ws.connect(url, sslopt={"cert_reqs": ssl.CERT_NONE})\n',
        [`${TLS}:6 urllib3.PoolManager`, `${TLS}:7 aiohttp.TCPConnector`, `${TLS}:8 cert_reqs`],
      ],
      [
        'MongoDB and redis options',
        'import redis\nfrom pymongo import MongoClient\n\n\ndef f(uri):\n    MongoClient(uri, tlsInsecure=True)\n    MongoClient("mongodb://db:27017/app?tls=true&tlsAllowInvalidCertificates=true")\n    return redis.Redis(ssl=True, ssl_cert_reqs=None)\n',
        [`${TLS}:6 pymongo.MongoClient`, `${TLS}:7 mongodb URI`, `${TLS}:8 redis.Redis`],
      ],
      [
        'environment switches for child processes',
        {
          file: 'settings.py',
          code: 'import os\n\n\ndef f():\n    os.environ["PYTHONHTTPSVERIFY"] = "0"\n    os.environ.setdefault("CURL_CA_BUNDLE", "")\n    return dict(os.environ, NODE_TLS_REJECT_UNAUTHORIZED="0")\n',
        },
        [
          `${TLS}:5 os.environ`,
          `${TLS}:6 os.environ.setdefault`,
          `${TLS}:7 NODE_TLS_REJECT_UNAUTHORIZED`,
        ],
      ],
      [
        'a flag imported from the settings module',
        {
          files: {
            'app/settings.py': 'import os\n\nVERIFY = os.environ.get("VERIFY", "1") == "1"\n',
            'app/client.py':
              'import requests\n\nfrom app.settings import VERIFY\n\n\ndef f(url):\n    return requests.get(url, verify=VERIFY, timeout=10)\n',
          },
        },
        [`${TLS}:7 requests.get`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes trusted certificate authorities, servers and text about the settings', () => {
    const [actual, expected] = outcomes([
      [
        'a CA bundle from a parameter, a setting or the environment',
        {
          file: 'settings.py',
          code: 'import os\n\nimport requests\n\nCA = os.environ.get("CA_BUNDLE", "/etc/ssl/ca.pem")\n\n\ndef f(url, ca_path, settings):\n    requests.get(url, verify=ca_path, timeout=10)\n    requests.get(url, verify=CA, timeout=10)\n    return requests.get(url, verify=settings.CA_BUNDLE, timeout=10)\n',
        },
        [],
      ],
      [
        'literal False, which ruff S501 reports',
        'import requests\n\n\ndef f(url):\n    return requests.get(url, verify=False, timeout=10)\n',
        [],
      ],
      [
        'a server that asks for optional client certificates',
        'import ssl\n\n\ndef f(cert, key):\n    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)\n    context.load_cert_chain(cert, key)\n    context.verify_mode = ssl.CERT_OPTIONAL\n    context.check_hostname = False\n    return context\n',
        [],
      ],
      [
        'server sockets and server configuration',
        'import ssl\n\nimport uvicorn\n\n\ndef f(app, sock):\n    server = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)\n    server.verify_mode = ssl.CERT_NONE\n    uvicorn.run(app, ssl_cert_reqs=ssl.CERT_NONE)\n    return server.wrap_socket(sock, server_side=True)\n',
        [],
      ],
      [
        'a MongoDB client with a CA file',
        'from pymongo import MongoClient\n\n\ndef f(uri, ca):\n    return MongoClient(uri, tls=True, tlsCAFile=ca)\n',
        [],
      ],
      [
        'warnings and help text',
        'def f(logger):\n    logger.warning("PYTHONHTTPSVERIFY=0 is set; certificate checks are off")\n    return "Never pass verify=False or tlsInsecure=true in production"\n',
        [],
      ],
      [
        'a test helper',
        {
          file: 'tests/support/tls.py',
          code: 'import ssl\n\n\ndef trusting_context():\n    context = ssl.create_default_context()\n    context.check_hostname = False\n    return context\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
