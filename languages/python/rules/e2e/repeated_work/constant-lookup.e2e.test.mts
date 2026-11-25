import {
  inFile,
  pythonLines,
  ruleLine,
  useRuleScripts,
} from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const CONSTANT_LOOKUP = ruleLine('constant-lookup-in-loop');
const constantLookup = useRuleScripts('constant-lookup-in-loop', { enabled });

constantLookup.describeRules('constant-lookup-in-loop', () => {
  constantLookup.itOutcomes('flags constant URL parses and registry lookups inside loops', [
    [
      'urlparse with literal in for loop',
      pythonLines(
        'from urllib.parse import urlparse',
        'def build(paths):',
        '    out = []',
        '    for path in paths:',
        '        out.append(urlparse("https://example.com/api").netloc + "/" + path)',
        '    return out',
      ),
      [CONSTANT_LOOKUP(5, "url|urlparse('https://example.com/api')")],
    ],
    [
      'urlsplit with module constant in comprehension',
      pythonLines(
        'from urllib.parse import urlsplit',
        'BASE = "https://example.com/api"',
        'def build(paths):',
        '    return [urlsplit(BASE).netloc + "/" + path for path in paths]',
      ),
      [CONSTANT_LOOKUP(4, 'url|urlsplit(BASE)')],
    ],
    [
      'urlparse with outer constant in map lambda',
      pythonLines(
        'from urllib.parse import urlparse',
        'def build(paths):',
        '    base = "https://example.com/api"',
        '    return list(map(lambda path: urlparse(base).netloc + path, paths))',
      ),
      [CONSTANT_LOOKUP(4, 'url|urlparse(base)')],
    ],
    [
      'ZoneInfo with literal in for loop',
      pythonLines(
        'from zoneinfo import ZoneInfo',
        'def tag(items):',
        '    return [(item, ZoneInfo("UTC")) for item in items]',
      ),
      [CONSTANT_LOOKUP(3, "lookup|ZoneInfo('UTC')")],
    ],
    [
      'importlib.import_module with literal in loop',
      pythonLines(
        'import importlib',
        'def load(names):',
        '    return [getattr(importlib.import_module("app.handlers"), n) for n in names]',
      ),
      [CONSTANT_LOOKUP(3, "lookup|importlib.import_module('app.handlers')")],
    ],
    [
      'logging.getLogger with literal in loop',
      pythonLines(
        'import logging',
        'def report(rows):',
        '    for row in rows:',
        '        logging.getLogger("app.worker").info(row)',
      ),
      [CONSTANT_LOOKUP(4, "lookup|logging.getLogger('app.worker')")],
    ],
    [
      'ip_network with literal in while loop',
      pythonLines(
        'import ipaddress',
        'def check(addresses):',
        '    index = 0',
        '    while index < len(addresses):',
        '        net = ipaddress.ip_network("10.0.0.0/8")',
        '        index += 1',
        '    return net',
      ),
      [CONSTANT_LOOKUP(5, "lookup|ipaddress.ip_network('10.0.0.0/8')")],
    ],
  ]);

  constantLookup.itOutcomes('allows hoisted, dynamic, mutated-state, and test lookups', [
    [
      'hoisted urlparse before loop',
      pythonLines(
        'from urllib.parse import urlparse',
        'def build(paths):',
        '    base = urlparse("https://example.com/api")',
        '    return [base.netloc + "/" + path for path in paths]',
      ),
      [],
    ],
    [
      'dynamic URL argument',
      pythonLines(
        'from urllib.parse import urlparse',
        'def hosts(urls):',
        '    return [urlparse(url).netloc for url in urls]',
      ),
      [],
    ],
    [
      'comprehension first generator iter evaluated once',
      pythonLines(
        'from urllib.parse import urlparse',
        'def segments():',
        '    return [part for part in urlparse("https://example.com/a/b").path.split("/")]',
      ),
      [],
    ],
    [
      'import_module with invalidate_caches in loop',
      pythonLines(
        'import importlib',
        'def load(names):',
        '    out = []',
        '    for name in names:',
        '        importlib.invalidate_caches()',
        '        out.append(importlib.import_module("app.handlers"))',
        '    return out',
      ),
      [],
    ],
    [
      'getLogger with basicConfig in loop',
      pythonLines(
        'import logging',
        'def run(rows):',
        '    for row in rows:',
        '        logging.basicConfig()',
        '        logging.getLogger("app").info(row)',
      ),
      [],
    ],
    [
      'nested def inside loop',
      pythonLines(
        'from urllib.parse import urlparse',
        'def register(items):',
        '    fns = []',
        '    for _ in items:',
        '        def fn():',
        '            return urlparse("https://example.com").netloc',
        '        fns.append(fn)',
        '    return fns',
      ),
      [],
    ],
    [
      'test file skipped',
      inFile(
        'tests/test_lookups.py',
        pythonLines(
          'from urllib.parse import urlparse',
          'def test_build(paths):',
          '    return [urlparse("https://example.com").netloc for _ in paths]',
        ),
      ),
      [],
    ],
  ]);
});
