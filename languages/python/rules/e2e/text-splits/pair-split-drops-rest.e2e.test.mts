import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('pair-split-drops-rest', () => {
  itOutcomes('flags a split on a pair separator that keeps the second part only', [
    [
      'an index of the split',
      'def value(line):\n    return line.split(":")[1]\n',
      ["pair-split-drops-rest:2 line.split(':')"],
    ],
    [
      'an equals sign',
      'def value(entry):\n    return entry.split("=")[1].strip()\n',
      ["pair-split-drops-rest:2 entry.split('=')"],
    ],
    [
      'the first two parts unpacked',
      'def pair(line):\n    key, value = line.split(":")[:2]\n    return key, value\n',
      ["pair-split-drops-rest:2 line.split(':')"],
    ],
    [
      'a local that is indexed',
      'def value(line):\n    parts = line.split(":")\n    return parts[0], parts[1]\n',
      ["pair-split-drops-rest:2 line.split(':')"],
    ],
    [
      'an attribute receiver',
      'def value(self):\n    return self.header.split(":")[1]\n',
      ["pair-split-drops-rest:2 self.header.split(':')"],
    ],
  ]);

  itOutcomes('leaves splits that keep the rest or reject it', [
    ['a limit', 'def value(line):\n    return line.split(":", 1)[1]\n', []],
    [
      'partition',
      'def value(line):\n    _, _, value = line.partition(":")\n    return value\n',
      [],
    ],
    [
      'a strict unpacking',
      'def pair(line):\n    key, value = line.split(":")\n    return key, value\n',
      [],
    ],
    [
      'a length check of two',
      'def value(line):\n    parts = line.split(":")\n    if len(parts) != 2:\n        raise ValueError(line)\n' +
        '    return parts[1]\n',
      [],
    ],
    [
      'the rest is joined back',
      'def value(line):\n    parts = line.split(":")\n    return ":".join(parts[1:])\n',
      [],
    ],
    ['another separator', 'def value(line):\n    return line.split(",")[1]\n', []],
    ['a constant receiver', 'def value():\n    return "a:b".split(":")[1]\n', []],
    ['a clock', 'def minutes(clock_time):\n    return clock_time.split(":")[1]\n', []],
    ['a ratio', 'def height(aspect_ratio):\n    return aspect_ratio.split(":")[1]\n', []],
    ['the first part', 'def key(line):\n    return line.split(":")[0]\n', []],
    [
      'a test file',
      inFile('tests/test_mod.py', 'def value(line):\n    return line.split(":")[1]\n'),
      [],
    ],
  ]);
});
