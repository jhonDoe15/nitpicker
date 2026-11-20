import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('expanding-replacement', () => {
  itOutcomes('flags a runtime replacement string given to re.sub', [
    [
      'a string parameter',
      'import re\n\n\ndef fill(text: str, name: str) -> str:\n    return re.sub(r"\\{name\\}", name, text)\n',
      ['expanding-replacement:5 name'],
    ],
    [
      'an f-string',
      'import re\n\n\ndef fill(text, name):\n    return re.sub("a", f"<{name}>", text)\n',
      ["expanding-replacement:5 f'<{name}>'"],
    ],
    [
      'a concatenation',
      'import re\n\n\ndef fill(text, name):\n    return re.sub("a", "<" + name + ">", text)\n',
      ["expanding-replacement:5 '<' + name + '>'"],
    ],
    [
      'str of a value',
      'import re\n\n\ndef fill(text, value):\n    return re.subn("a", str(value), text)\n',
      ['expanding-replacement:5 str(value)'],
    ],
    [
      'a compiled pattern',
      'import re\n\nPLACEHOLDER = re.compile("a")\n\n\ndef fill(text: str, name: str) -> str:\n    return PLACEHOLDER.sub(name, text)\n',
      ['expanding-replacement:7 name'],
    ],
    [
      'a local built from a string expression',
      'import re\n\n\ndef fill(text, name):\n    label = name.strip()\n    return re.sub("a", label, text)\n',
      ['expanding-replacement:6 label'],
    ],
  ]);

  itOutcomes('leaves constants, functions and escaped values alone', [
    ['a constant', 'import re\n\n\ndef fill(text):\n    return re.sub("(a)", r"\\1b", text)\n', []],
    [
      'a lambda',
      'import re\n\n\ndef fill(text, name):\n    return re.sub("a", lambda _: name, text)\n',
      [],
    ],
    [
      'an escaped value',
      'import re\n\n\ndef fill(text: str, name: str):\n    return re.sub("a", name.replace("\\\\", "\\\\\\\\"), text)\n',
      [],
    ],
    [
      'a group reference in the template',
      'import re\n\n\ndef fill(text, tag):\n    return re.sub("(a)", "\\\\1" + tag, text)\n',
      [],
    ],
    [
      'a function name',
      'import re\n\n\ndef upper(match):\n    return match.group(0).upper()\n\n\ndef fill(text):\n    return re.sub("a", upper, text)\n',
      [],
    ],
    ['str.replace', 'def fill(text: str, name: str):\n    return text.replace("a", name)\n', []],
    [
      'an unrelated sub method',
      'def fill(text: str, name: str, pattern):\n    return pattern.sub(name, text)\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'import re\n\n\ndef helper(text: str, name: str):\n    return re.sub("a", name, text)\n',
      ),
      [],
    ],
  ]);
});
