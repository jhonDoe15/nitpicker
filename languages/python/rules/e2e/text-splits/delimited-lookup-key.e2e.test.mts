import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('delimited-lookup-key', () => {
  itOutcomes('flags a dict or set key joined from two strings with a delimiter', [
    [
      'an f-string key read',
      'def read(seen: dict[str, bool], tenant: str, name: str):\n    return seen[f"{tenant}:{name}"]\n',
      ["delimited-lookup-key:2 f'{tenant}:{name}'"],
    ],
    [
      'a concatenation read through a local',
      'def known(seen: dict[str, bool], tenant: str, name: str) -> bool:\n    key = tenant + "-" + name\n' +
        '    return key in seen\n',
      ["delimited-lookup-key:3 tenant + '-' + name"],
    ],
    [
      'a join of a list',
      'def read(seen: dict[str, bool], a: str, b: str):\n    return seen.get("|".join([a, b]))\n',
      ["delimited-lookup-key:2 '|'.join([a, b])"],
    ],
    [
      'a set add',
      'def add(a: str, b: str) -> None:\n    pairs = set()\n    pairs.add(f"{a}/{b}")\n',
      ["delimited-lookup-key:3 f'{a}/{b}'"],
    ],
    [
      'an attribute dict',
      'class Cache:\n    def __init__(self) -> None:\n        self.items = {}\n\n    def get(self, a: str, ' +
        'b: str):\n        return self.items.get(f"{a}:{b}")\n',
      ["delimited-lookup-key:6 f'{a}:{b}'"],
    ],
  ]);

  itOutcomes('leaves tuple keys and parts that cannot hold the delimiter', [
    [
      'a tuple key',
      'def known(seen: dict[tuple[str, str], bool], a: str, b: str) -> bool:\n    return (a, b) in seen\n',
      [],
    ],
    [
      'ids',
      'def read(seen: dict[str, bool], tenant_id: str, user_id: str):\n    return seen[f"{tenant_id}:{user_id}"]\n',
      [],
    ],
    [
      'parts that are not annotated str',
      'def read(seen: dict[str, bool], a, b):\n    return seen[f"{a}:{b}"]\n',
      [],
    ],
    [
      'one string part',
      'def read(seen: dict[str, bool], a: str):\n    return seen[f"{a}:items"]\n',
      [],
    ],
    [
      'a value that is not a dict',
      'def label(a: str, b: str) -> str:\n    return f"{a}:{b}"\n',
      [],
    ],
    [
      'a mapping that is not known to be a dict',
      'def read(config, a: str, b: str):\n    return config[f"{a}_{b}"]\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'def read(seen: dict[str, bool], a: str, b: str):\n    return seen[f"{a}:{b}"]\n',
      ),
      [],
    ],
  ]);
});
