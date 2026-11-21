import {
  inFile,
  pythonLines,
  ruleLine,
  useRuleScripts,
} from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const READ_ALL = ruleLine('read-all-before-pass');
const readAll = useRuleScripts('read-all-before-pass', { enabled });

readAll.describeRules('read-all-before-pass', () => {
  readAll.itOutcomes('flags reading every input into memory before a single pass', [
    [
      'list comprehension with read_text before one pass',
      pythonLines(
        'def run(paths, summarize):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for document in documents:',
        '        summarize(document)',
      ),
      [READ_ALL(2, 'documents')],
    ],
    [
      'empty list filled in for loop with read_text',
      pythonLines(
        'def run(paths, summarize):',
        '    contents = []',
        '    for path in paths:',
        '        contents.append(path.read_text(encoding="utf-8"))',
        '    for content in contents:',
        '        summarize(content)',
      ),
      [READ_ALL(2, 'contents')],
    ],
    [
      'empty list filled with open context manager',
      pythonLines(
        'def run(paths, summarize):',
        '    contents = []',
        '    for path in paths:',
        '        with open(path, encoding="utf-8") as handle:',
        '            contents.append(handle.read())',
        '    for content in contents:',
        '        summarize(content)',
      ),
      [READ_ALL(2, 'contents')],
    ],
    [
      'json.loads over read_text in comprehension',
      pythonLines(
        'import json',
        'def run(paths, summarize):',
        '    configs = [json.loads(path.read_text(encoding="utf-8")) for path in paths]',
        '    for config in configs:',
        '        summarize(config)',
      ),
      [READ_ALL(3, 'configs')],
    ],
    [
      'asyncio.gather reading every path before one pass',
      pythonLines(
        'import asyncio',
        'async def run(paths, summarize):',
        '    documents = await asyncio.gather(*(asyncio.to_thread(p.read_text) for p in paths))',
        '    for document in documents:',
        '        summarize(document)',
      ),
      [READ_ALL(3, 'documents')],
    ],
  ]);

  readAll.itOutcomes('allows streaming, writes, fixed lists, multiple uses, and unknown loaders', [
    [
      'streaming one input at a time',
      pythonLines(
        'def run(paths, summarize):',
        '    for path in paths:',
        '        summarize(path.read_text(encoding="utf-8"))',
      ),
      [],
    ],
    [
      'pass writes files',
      pythonLines(
        'def run(paths, output):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for document in documents:',
        '        output.write_text(document, encoding="utf-8")',
      ),
      [],
    ],
    [
      'pass calls write helper',
      pythonLines(
        'def run(paths, write_back):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for document in documents:',
        '        write_back(document)',
      ),
      [],
    ],
    [
      'fixed literal list of paths',
      pythonLines(
        'from pathlib import Path',
        'def run(summarize):',
        '    documents = [Path(p).read_text(encoding="utf-8") for p in ["a.json", "b.json"]]',
        '    for document in documents:',
        '        summarize(document)',
      ),
      [],
    ],
    [
      'returned collection',
      pythonLines(
        'def run(paths):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    return documents',
      ),
      [],
    ],
    [
      'used again after pass',
      pythonLines(
        'def run(paths, summarize):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for document in documents:',
        '        summarize(document)',
        '    return len(documents)',
      ),
      [],
    ],
    [
      'iterated via enumerate',
      pythonLines(
        'def run(paths, summarize):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for index, document in enumerate(documents):',
        '        summarize(f"{index}:{document}")',
      ),
      [],
    ],
    [
      'collection read inside pass body',
      pythonLines(
        'def run(paths, summarize):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for document in documents:',
        '        summarize(f"{document}:{len(documents)}")',
      ),
      [],
    ],
    [
      'iterated across multiple rounds',
      pythonLines(
        'def run(paths, rounds, summarize):',
        '    documents = [path.read_text(encoding="utf-8") for path in paths]',
        '    for round_id in rounds:',
        '        for document in documents:',
        '            summarize(f"{round_id}:{document}")',
      ),
      [],
    ],
    [
      'unknown load helper skipped',
      pythonLines(
        'def run(paths, load, summarize):',
        '    documents = [load(path) for path in paths]',
        '    for document in documents:',
        '        summarize(document)',
      ),
      [],
    ],
    [
      'sorted before pass',
      pythonLines(
        'def run(paths, summarize):',
        '    texts = []',
        '    for path in paths:',
        '        texts.append(path.read_text(encoding="utf-8"))',
        '    texts.sort()',
        '    for text in texts:',
        '        summarize(text)',
      ),
      [],
    ],
    [
      'test file skipped',
      inFile(
        'tests/test_readers.py',
        pythonLines(
          'def test_run(paths, summarize):',
          '    documents = [path.read_text(encoding="utf-8") for path in paths]',
          '    for document in documents:',
          '        summarize(document)',
        ),
      ),
      [],
    ],
  ]);
});
