import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['regex-unescaped-value'],
});

describeRules('pattern-translation', () => {
  itOutcomes('flags a glob or pattern turned into another pattern language unescaped', [
    [
      'a glob into a regex through a variable',
      'import re\n\n\ndef allowed(glob, path):\n    pattern = glob.replace("**", ".*").replace("*", "[^/]*")\n    return re.fullmatch(pattern, path)\n',
      ['pattern-translation:5 regex|glob'],
    ],
    [
      'a glob handed whole to re.compile',
      'import re\n\n\ndef allowed(glob):\n    return re.compile(glob.replace("*", ".*").replace("?", "."))\n',
      ['pattern-translation:5 regex|glob'],
    ],
    [
      'a chain of re.sub calls',
      'import re\n\n\ndef allowed(glob, path):\n    pattern = re.sub(r"\\?", ".", re.sub(r"\\*", ".*", glob))\n    return re.match(pattern, path)\n',
      ['pattern-translation:5 regex|glob'],
    ],
    [
      'a regex source into LIKE',
      'def like(source):\n    return source.replace(".*", "%").replace(".", "_")\n',
      ['pattern-translation:2 like|source'],
    ],
    [
      'a glob into LIKE',
      'def like(term):\n    return term.replace("*", "%").replace("?", "_")\n',
      ['pattern-translation:2 like|term'],
    ],
  ]);

  itOutcomes('leaves escaped, constant and unrelated chains alone', [
    [
      're.escape first',
      'import re\n\n\ndef allowed(glob, path):\n    pattern = re.escape(glob).replace("\\\\*\\\\*", ".*").replace("\\\\*", "[^/]*")\n    return re.fullmatch(pattern, path)\n',
      [],
    ],
    [
      'an escaping step in the chain',
      'import re\n\n\ndef allowed(glob, path):\n    pattern = re.sub(r"[.+^$(){}|\\\\]", r"\\\\\\g<0>", glob).replace("*", ".*").replace("?", ".")\n    return re.fullmatch(pattern, path)\n',
      [],
    ],
    [
      'a LIKE escape first',
      'def like(term):\n    return term.replace("%", "\\\\%").replace("_", "\\\\_").replace("*", "%")\n',
      [],
    ],
    [
      'constant text',
      'import re\n\nPATTERN = re.compile("src/**/*.py".replace("**", ".*").replace("*", "[^/]*"))\n',
      [],
    ],
    [
      'a value built into a larger pattern, which regex-unescaped-value owns',
      "import re\n\n\ndef allowed(glob):\n    return re.compile(f\"^{glob.replace('*', '.*').replace('?', '.')}$\")\n",
      [],
    ],
    [
      'a chain that never reaches a regex',
      'def label(glob):\n    return glob.replace("**", ".*").replace("*", "[^/]*")\n',
      [],
    ],
    [
      'a single replace',
      'import re\n\n\ndef allowed(glob):\n    return re.compile(glob.replace("*", ".*"))\n',
      [],
    ],
    [
      'unrelated replacements',
      'import re\n\n\ndef slug(text):\n    return re.compile(text.replace(" ", "-").replace("_", "-"))\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'import re\n\n\ndef helper(glob):\n    return re.compile(glob.replace("*", ".*").replace("?", "."))\n',
      ),
      [],
    ],
  ]);
});
