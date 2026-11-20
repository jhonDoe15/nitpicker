import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('host-port-colon-split', () => {
  itOutcomes('flags a host split on a colon', [
    [
      'a host name',
      'def name(host):\n    return host.split(":")[0]\n',
      ['host-port-colon-split:2 host'],
    ],
    [
      'a Host header read',
      'def name(request):\n    return request.headers.get("Host").split(":")[0]\n',
      ["host-port-colon-split:2 request.headers.get('Host')"],
    ],
    [
      'a forwarded host subscript with partition',
      'def name(headers):\n    return headers["x-forwarded-host"].partition(":")[0]\n',
      ["host-port-colon-split:2 headers['x-forwarded-host']"],
    ],
    [
      'an attribute ending in host',
      'def name(self):\n    return self.upstream_host.split(":", 1)[0]\n',
      ['host-port-colon-split:2 self.upstream_host'],
    ],
    [
      'a netloc',
      'def name(parsed):\n    return parsed.netloc.split(":")[0]\n',
      ['host-port-colon-split:2 parsed.netloc'],
    ],
    [
      'an index of the colon',
      'def name(host):\n    return host[: host.index(":")]\n',
      ['host-port-colon-split:2 host'],
    ],
  ]);

  itOutcomes('leaves other values, brackets and parsed hosts', [
    ['a mac address', 'def parts(address):\n    return address.split(":")\n', []],
    ['another separator', 'def name(host):\n    return host.split(",")\n', []],
    ['rsplit', 'def port(host):\n    return host.rsplit(":", 1)[1]\n', []],
    [
      'a bracket literal',
      'def name(host):\n    if host.startswith("["):\n        return host\n    return host.split(":")[0]\n',
      [],
    ],
    [
      'the hostname attribute in the function',
      'def name(url, host):\n    return url.hostname or host.split(":")[0]\n',
      [],
    ],
    [
      'ipaddress in the function',
      'import ipaddress\n\n\ndef name(host):\n    ipaddress.ip_address(host)\n    return host.split(":")[0]\n',
      [],
    ],
    [
      'a single-colon check that compares find and rfind',
      'def name(host):\n    if host.find(":") == host.rfind(":"):\n        return host.split(":")[0]\n ' +
        '   return host\n',
      [],
    ],
    [
      'a colon count',
      'def name(host):\n    if host.count(":") == 1:\n        return host.split(":")[0]\n    return host\n',
      [],
    ],
    ['a name that only ends in host', 'def name(ghost):\n    return ghost.split(":")[0]\n', []],
    [
      'a test file',
      inFile('tests/test_mod.py', 'def name(host):\n    return host.split(":")[0]\n'),
      [],
    ],
  ]);
});
