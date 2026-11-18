import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('prefix-without-boundary', () => {
  itOutcomes('flags a text prefix or suffix check without a boundary', [
    [
      'a path prefix named base',
      'def strip(pathname, base):\n    if ' +
        'pathname.startswith(base):\n        return ' +
        'pathname[len(base):]\n    return pathname\n',
      ['prefix-without-boundary:2 prefix|pathname.startswith(base)'],
    ],
    [
      'a host suffix named domain',
      'def matches(hostname, domain):\n    return hostname.endswith(domain)\n',
      ['prefix-without-boundary:2 suffix|hostname.endswith(domain)'],
    ],
    [
      'a bare origin',
      'def local(origin):\n    return origin.startswith("http://localhost")\n',
      ["prefix-without-boundary:2 origin|origin.startswith('http://localhost')"],
    ],
    [
      'a built path prefix',
      'def inside(file_path, root):\n    return file_path.startswith(f"{root}")\n',
      [],
    ],
  ]);

  itOutcomes('leaves bounded and guarded checks alone', [
    [
      'an equality test of the same values',
      'def inside(pathname, base):\n    return pathname == base or pathname.startswith(base)\n',
      [],
    ],
    [
      'a prefix that ends in a separator',
      'def inside(pathname, base):\n    return pathname.startswith(base + "/")\n',
      [],
    ],
    [
      'a dotted domain suffix',
      'def inside(hostname, domain):\n    return hostname.endswith("." + domain)\n',
      [],
    ],
    [
      'a leading dot check on the same value',
      'def inside(hostname, domain):\n    return domain.startswith(".") and hostname.endswith(domain)\n',
      [],
    ],
    [
      'a character check after the prefix',
      'def inside(pathname, root):\n    return pathname.startswith(root) and pathname[len(root)] == "/"\n',
      [],
    ],
    [
      'a prefix named path',
      'def matches(filename, path):\n    return filename.startswith(path)\n',
      [],
    ],
    ['a directory name in a path', 'def vendored(path):\n    return "node_modules" in path\n', []],
    [
      'an IPv6 bracket test',
      'def bracketed(hostname):\n    return hostname.startswith("[") and hostname.endswith("]")\n',
      [],
    ],
    ['a suffix of a line', 'def has(line, domain):\n    return line.endswith(domain)\n', []],
    [
      'a prefix normalised by a conditional',
      'def inside(pathname, base):\n    base = base if ' +
        'base.endswith("/") else base + "/"\n    return ' +
        'pathname.startswith(base)\n',
      [],
    ],
    [
      'a prefix normalised by reassignment',
      'def inside(pathname, base):\n    base += "/"\n    return pathname.startswith(base)\n',
      [],
    ],
    ['a plain literal prefix', 'def api(path):\n    return path.startswith("/api")\n', []],
    [
      'a test file',
      {
        file: 'tests/test_paths.py',
        code: 'def test(pathname, base):\n    assert pathname.startswith(base)\n',
      },
      [],
    ],
  ]);
});
