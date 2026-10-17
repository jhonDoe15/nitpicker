import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const TLS = 'tls-verification-off';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(TLS))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('tls-verification-off: values that reach the switch', () => {
  it('follows option dicts, partial, parameter defaults and class attributes', () => {
    const [actual, expected] = outcomes([
      [
        'an options dict built in steps, a constant dict and dict(...)',
        'import requests\n\nOPTIONS = {"timeout": 10, "verify": False}\n\n\ndef f(url):\n    options = {"timeout": 10}\n    options["verify"] = False\n    requests.get(url, **options)\n    requests.get(url, **OPTIONS)\n    return requests.get(url, **dict(timeout=10, verify=False))\n',
        [`${TLS}:9 requests.get`, `${TLS}:10 requests.get`, `${TLS}:11 requests.get`],
      ],
      [
        'functools.partial and an sslopt dict built in steps',
        'import functools\nimport ssl\n\nimport requests\nimport websocket\n\ninsecure_get = functools.partial(requests.get, verify=False, timeout=5)\n\n\ndef f(url):\n    opts = {}\n    opts["cert_reqs"] = ssl.CERT_NONE\n    return websocket.create_connection(url, sslopt=opts)\n',
        [`${TLS}:7 requests.get`, `${TLS}:12 cert_reqs`],
      ],
      [
        'parameter defaults of False',
        'import httpx\nimport requests\n\n\ndef fetch(url, verify=False):\n    return requests.get(url, verify=verify, timeout=5)\n\n\ndef make(*, verify: bool = False) -> httpx.Client:\n    return httpx.Client(verify=verify)\n',
        [`${TLS}:6 requests.get`, `${TLS}:10 httpx.Client`],
      ],
      [
        'a class attribute and a named ssl= value',
        'import aiohttp\nimport httpx\n\nSSL = False\n\n\nclass Client:\n    VERIFY = False\n\n    def make(self):\n        return httpx.Client(verify=self.VERIFY)\n\n\nasync def f(url):\n    async with aiohttp.ClientSession() as s:\n        return await s.get(url, ssl=SSL)\n',
        [`${TLS}:11 httpx.Client`, `${TLS}:16 s.get`],
      ],
      [
        'VerifyMode.CERT_NONE, verify_mode = 0 and setattr',
        'import ssl\nfrom ssl import VerifyMode\n\n\ndef f():\n    a = ssl.create_default_context()\n    a.verify_mode = VerifyMode.CERT_NONE\n    b = ssl.create_default_context()\n    b.verify_mode = ssl.VerifyMode.CERT_NONE\n    c = ssl.create_default_context()\n    c.verify_mode = 0\n    setattr(c, "check_hostname", False)\n    return a, b, c\n',
        [
          `${TLS}:7 verify_mode`,
          `${TLS}:9 verify_mode`,
          `${TLS}:11 verify_mode`,
          `${TLS}:12 check_hostname`,
        ],
      ],
      [
        'a chained session call names the call',
        'import requests\n\n\ndef f(url, verify):\n    return requests.Session().request("GET", url, verify=verify == "yes", timeout=5)\n',
        [`${TLS}:5 requests.Session().request`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('tls-verification-off: clients and browsers', () => {
  it('flags the switches of browser automation and common clients', () => {
    const [actual, expected] = outcomes([
      [
        'Playwright and Selenium',
        'from playwright.sync_api import sync_playwright\nfrom selenium import webdriver\n\n\ndef f(url):\n    with sync_playwright() as p:\n        p.chromium.launch().new_context(ignore_https_errors=True)\n    options = webdriver.ChromeOptions()\n    options.add_argument("--ignore-certificate-errors")\n    options.set_capability("acceptInsecureCerts", True)\n    options.accept_insecure_certs = True\n    return webdriver.Chrome(options=options)\n',
        [
          `${TLS}:7 p.chromium.launch().new_context`,
          `${TLS}:9 --ignore-certificate-errors`,
          `${TLS}:10 acceptInsecureCerts`,
          `${TLS}:11 accept_insecure_certs`,
        ],
      ],
      [
        'Elasticsearch, OpenSearch, kafka, ldap3, docker and minio',
        'import ssl\n\nimport docker\nfrom docker.tls import TLSConfig\nfrom elasticsearch import Elasticsearch\nfrom kafka import KafkaProducer\nfrom ldap3 import Tls\nfrom minio import Minio\nfrom opensearchpy import OpenSearch\n\n\ndef f(host, servers, key, secret):\n    Elasticsearch(host, verify_certs=False)\n    OpenSearch(hosts=[host], use_ssl=True, ssl_assert_hostname=False)\n    KafkaProducer(bootstrap_servers=servers, ssl_check_hostname=False)\n    Tls(validate=ssl.CERT_NONE)\n    docker.DockerClient(base_url=host, tls=TLSConfig(verify=False))\n    return Minio(host, access_key=key, secret_key=secret, cert_check=False)\n',
        [
          `${TLS}:13 elasticsearch.Elasticsearch`,
          `${TLS}:14 opensearchpy.OpenSearch`,
          `${TLS}:15 kafka.KafkaProducer`,
          `${TLS}:16 ldap3.Tls`,
          `${TLS}:17 docker.tls.TLSConfig`,
          `${TLS}:18 minio.Minio`,
        ],
      ],
      [
        'MongoDB URIs built with an f-string or concatenation',
        'from pymongo import MongoClient\n\nBASE = "mongodb://db:27017/app"\nURI = BASE + "?tls=true&tlsAllowInvalidCertificates=true"\n\n\ndef f(host):\n    return MongoClient(f"mongodb://{host}/app?tls=true&tlsInsecure=true")\n',
        [`${TLS}:4 connection URI`, `${TLS}:8 mongodb URI`],
      ],
      [
        'an explicit insecure command-line flag',
        'import argparse\n\nimport requests\n\n\ndef main(url):\n    parser = argparse.ArgumentParser()\n    parser.add_argument("--insecure", action="store_true")\n    args = parser.parse_args()\n    return requests.get(url, verify=not args.insecure, timeout=10)\n',
        [`${TLS}:10 requests.get`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
