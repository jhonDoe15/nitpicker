import { cpSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../../core/diff/comparison/positions/touched-lines.mjs';
import {
  commitBranch,
  fixture,
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

const BASE = {
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

describe.skipIf(!pythonE2eEnabled)('Python strict rules on lines a change touches', () => {
  let ruffFindings;

  beforeAll(() => {
    const project = repository();
    cpSync(fixture, project, { recursive: true });
    write(project, {
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      ...BASE,
    });
    initializeRepository(project, 'legacy strict findings');
    installPackages(project, ['-e', '.', 'coverage', 'pytest', 'mypy']);
    commitBranch(project, 'touches', HEAD);
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
});
