import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../../core/diff/comparison/positions/touched-lines.mjs';
import {
  command,
  fixture,
  git,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from '../test-support/python-e2e-support.mjs';

const lines = (...text) => `${text.join('\n')}\n`;
const SUM = ['    total = 0', '    for item in items:', '        total += item'];
const PROCESS = ['def process(items):', '    print("start")'];
const MAGIC = (name) => [`def ${name}(n):`, '    return n == 3'];
const PRINTS = [
  'def one():',
  '    print("a")',
  '    return 1',
  '',
  '',
  'def two():',
  '    print("b")',
];

const LEGACY = 'src/demo/legacy.py';
const HANDLERS = 80;
const EDITED_HANDLER = 40;
const legacyHandler = (index) => [
  `def handler_${String(index)}(value,flag = False):`,
  `    if value == ${String(index + 3)}: print( 'hit ${String(index)}' )`,
  `    if flag and value > ${String(index + 300)}:`,
  "        print('big',",
  '              value)',
  '    items = [ value,',
  '              flag ]',
  '    print( "items" , items )',
  '    return items',
];

const BASE = {
  [LEGACY]: lines(
    ...Array.from({ length: HANDLERS }, (_, index) => [...legacyHandler(index), '', '']).flat(),
  ),
  'src/demo/proc.py': lines(...PROCESS, ...SUM, '    print("done")', '    return total'),
  'src/demo/messy.py': lines(
    'def hello(name):',
    "    print('hello ' + name)",
    "    print( 'bye ' + name )",
    '    return name',
  ),
  'src/demo/magic.py': lines(...MAGIC('first'), '', '', ...MAGIC('second')),
  'src/demo/prints.py': lines(...PRINTS),
  'src/demo/edited.py': lines('def edited(items):', '    print("start")', '    return items'),
};

const HEAD = {
  'src/demo/proc.py': lines(
    ...['def summed(items):', ...SUM, '    return total', '', ''],
    ...[...PROCESS, '    total = summed(items)', '    print("done")', '    return total'],
  ),
  'src/demo/messy.py': lines(
    'def hello(name):',
    '    print("hello " + name)',
    '    print("bye " + name)',
    '    return name',
  ),
  'src/demo/magic.py': lines(
    ...[...MAGIC('first'), '', ''],
    ...['def check(x):', '    if x == 3:', '        raise ValueError("three")', '    return x'],
    ...['', '', ...MAGIC('second')],
  ),
  'src/demo/prints.py': lines(PRINTS[0], '    print("new")', ...PRINTS.slice(1)),
  'src/demo/edited.py': lines(
    'def edited(items):',
    '    print("start", items)',
    '    return items',
  ),
};

function commitFormatted(project) {
  git(project, 'checkout', '-q', '-b', 'touches', 'main');
  write(project, HEAD);
  command(project, 'ruff', ['format', '--quiet', LEGACY]);
  const formatted = readFileSync(path.join(project, LEGACY), 'utf8').split('\n');
  const edited = formatted
    .map((line, index) => (line === '    print("items", items)' ? index : undefined))
    .filter((index) => index !== undefined)[EDITED_HANDLER];
  write(project, {
    [LEGACY]: formatted.with(edited, '    print("items", items, value)').join('\n'),
  });
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'ruff format and one edit');
  return { formatted, editedLine: edited + 1 };
}

describe.skipIf(!pythonE2eEnabled)('Python strict rules on lines a change touches', () => {
  let ruffFindings;
  let legacy;

  beforeAll(() => {
    const project = repository();
    cpSync(fixture, project, { recursive: true });
    write(project, {
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      ...BASE,
    });
    initializeRepository(project, 'legacy strict findings');
    installPackages(project, ['-e', '.', 'coverage', 'pytest', 'mypy']);
    legacy = commitFormatted(project);
    ruffFindings = gate(project, 'touches')
      .json('new-findings.json')
      .filter(({ tool }) => tool === 'ruff');
  });

  afterAll(removeRepositories);

  it('keeps legacy findings baselined above an inserted helper and through a ruff format run', () => {
    const files = ruffFindings.map(({ path: file }) => file);

    expect(files).not.toContain('src/demo/proc.py');
    expect(files).not.toContain('src/demo/messy.py');
  });

  it('reports a repeated finding on the added line, not on a legacy one', () => {
    expect(
      ruffFindings
        .filter(({ path: file }) => file === 'src/demo/magic.py' || file === 'src/demo/prints.py')
        .map(({ rule, path: file, location }) => `${rule} ${file}:${String(location.line)}`),
    ).toEqual(['PLR2004 src/demo/magic.py:6', 'T201 src/demo/prints.py:2']);
  });

  it('says a legacy finding is new because the change edited its line', () => {
    const [edited, ...rest] = ruffFindings.filter(
      ({ path: file }) => file === 'src/demo/edited.py',
    );

    expect(rest).toEqual([]);
    expect({ rule: edited.rule, line: edited.location.line }).toEqual({ rule: 'T201', line: 2 });
    expect(edited.message).toContain(EDITED_LINE_SENTENCE);
  });

  it('keeps 400 legacy findings baselined through a real ruff format run and holds the one edited line', () => {
    const legacyFindings = ruffFindings.filter(({ path: file }) => file === LEGACY);

    expect(legacy.formatted.length).toBeGreaterThan(HANDLERS * 9);
    expect(legacyFindings.map(({ rule, location }) => `${rule}:${String(location.line)}`)).toEqual([
      `T201:${String(legacy.editedLine)}`,
    ]);
    expect(legacyFindings[0].message).toContain(EDITED_LINE_SENTENCE);
  });
});
