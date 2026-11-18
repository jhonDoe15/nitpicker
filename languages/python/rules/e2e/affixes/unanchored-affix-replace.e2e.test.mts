import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('unanchored-affix-replace', () => {
  itOutcomes('flags a replace that removes a suffix or prefix', [
    [
      'a file suffix removed',
      'def name(part):\n    return part.replace(".git", "")\n',
      ["unanchored-affix-replace:2 suffix|part.replace('.git', '')"],
    ],
    [
      'a home directory replaced',
      'import os\n\ndef short(path):\n    return path.replace(os.getcwd(), "~")\n',
      ["unanchored-affix-replace:4 prefix|path.replace(os.getcwd(), '~')"],
    ],
    [
      'a url port replaced',
      'def move(url, parsed, port):\n    return url.replace(parsed.port, port)\n',
      ['unanchored-affix-replace:2 prefix|url.replace(parsed.port, port)'],
    ],
    [
      'a directory named value replaced',
      'def relative(path, root_dir):\n    return path.replace(root_dir, "")\n',
      ["unanchored-affix-replace:2 prefix|path.replace(root_dir, '')"],
    ],
  ]);

  itOutcomes('leaves anchored and unrelated replaces alone', [
    ['removesuffix', 'def name(part):\n    return part.removesuffix(".git")\n', []],
    [
      'a replace guarded by endswith on the same value',
      'def name(part):\n    return part.replace(".git", "") if part.endswith(".git") else part\n',
      [],
    ],
    [
      'a replace in the body of an endswith check',
      'def name(part):\n    if part.endswith(".git"):\n        part = part.replace(".git", "")\n    return part\n',
      [],
    ],
    [
      'a replace in the body of a startswith check',
      'def move(url, parsed, port):\n    if ' +
        'url.startswith(parsed.port):\n        return ' +
        'url.replace(parsed.port, port)\n    return url\n',
      [],
    ],
    [
      'a comprehension filtered by endswith',
      'def names(files):\n    return [f.replace(".json", "") for f in files if f.endswith(".json")]\n',
      [],
    ],
    ['a replacement that is not empty', 'def name(part):\n    return part.replace(".", "_")\n', []],
    ['a non-suffix literal', 'def name(part):\n    return part.replace("a-b", "")\n', []],
    [
      'a count that limits it to a literal',
      'def name(part):\n    return part.replace("x", "y")\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_names.py',
        code: 'def test(part):\n    assert part.replace(".git", "") == "a"\n',
      },
      [],
    ],
  ]);
});
