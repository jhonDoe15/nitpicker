import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('case-mismatched-lookup', () => {
  itOutcomes('flags a normalized key looked up in an unnormalized collection', [
    [
      'a set copied from a parameter',
      'def disabled(name, names):\n    values = set(names)\n    return name.lower() in values\n',
      ['case-mismatched-lookup:3 original|lower|values'],
    ],
    [
      'a literal collection with capitals',
      'ALLOWED = {"GET", "POST"}\n\ndef allowed(method):\n    return method.lower() in ALLOWED\n',
      ['case-mismatched-lookup:4 original|lower|ALLOWED'],
    ],
    [
      'a dict get with an upper-cased key',
      'LEVELS = {"debug": 1, "info": 2}\n\ndef level(name):\n    return LEVELS.get(name.upper())\n',
      ['case-mismatched-lookup:4 original|upper|LEVELS'],
    ],
    [
      'a collection filled with the lower-cased key and read as written',
      'def seen(names, name):\n    found = set()\n    for item in ' +
        'names:\n        found.add(item.lower())\n    return item in ' +
        'found\n',
      ['case-mismatched-lookup:5 raw|lower|found|item'],
    ],
  ]);

  itOutcomes('leaves normalized collections alone', [
    [
      'a collection normalized where it is built',
      'def disabled(name, names):\n    values = {value.lower() for ' +
        'value in names}\n    return name.lower() in values\n',
      [],
    ],
    [
      'a collection of lower-case literals',
      'ALLOWED = {"get", "post"}\n\ndef allowed(method):\n    return method.lower() in ALLOWED\n',
      [],
    ],
    [
      'a lookup of the key as written in a lower-case collection',
      'def seen(names, name):\n    found = set()\n    for item in ' +
        'names:\n        found.add(item.lower())\n    return ' +
        'name.lower() in found\n',
      [],
    ],
  ]);
});
