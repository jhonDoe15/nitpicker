import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { newFindings, usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const { pythonRepository, run } = usePythonFixtures(nitpickerCli);

const BROKEN_CONTRACT = [
  'Layers BROKEN',
  '',
  'Contracts: 0 kept, 1 broken.',
  '',
  'Broken contracts',
  '----------------',
  '',
  'Layers',
  '------',
  '',
  'demo is not allowed to import demo.b:',
  '',
  '- demo.a -> demo.b (l.4)',
  '',
].join('\n');

describe('nitpicker with "preset": "python" and its architecture checks', () => {
  it('fails when a new import makes a stable package depend on a less stable one', () => {
    const modules = Object.fromEntries(
      [
        'base/__init__',
        'base/core',
        'feature/__init__',
        'feature/a',
        'feature/b',
        'other/__init__',
        'other/o',
      ].map((name) => [`src/${name}.py`, '']),
    );
    const scan = (imports) => `${JSON.stringify(imports)}\n`;
    const from = (module, ...names) => ({ level: 0, module, names });
    const feature = {
      'src/feature/a.py': [from('base', 'core')],
      'src/feature/b.py': [from('base', 'core')],
      'src/other/o.py': [from('feature', 'a')],
    };
    const root = pythonRepository({ ...modules, 'import-scan.json': scan(feature) });
    expect(run(root).exitCode).toBe(0);
    writeFiles(root, {
      'import-scan.json': scan({ ...feature, 'src/base/core.py': [from('other', 'o')] }),
    });
    commit(root, 'depend on the volatile package');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newFindings(result, 'stability-direction')).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: 'src/base/__init__.py',
        identity: 'package-edge:base->other',
        message:
          'base depends on less stable package other. Depend on an abstraction in a more stable package instead. If this is intended, add {"rule":"stability-direction","paths":["src/base/__init__.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });
  it('fails on a new broken import-linter contract when the project has contracts', () => {
    const root = pythonRepository({
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'lint-imports.txt': 'Contracts: 1 kept, 0 broken.\n',
    });
    writeFiles(root, { 'lint-imports.txt': BROKEN_CONTRACT });
    commit(root, 'break the contract');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newFindings(result, 'contract-broken')).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: 'src/demo/a.py',
        identity: 'contract:Layers:demo.a -> demo.b',
        message:
          'Import contract "Layers" is broken: demo.a -> demo.b. Remove the import. If this is intended, add {"rule":"contract-broken","paths":["src/demo/a.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
  });
  it('skips import-linter when the config turns it off', () => {
    const root = pythonRepository({
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'nitpicker.config.json': '{ "preset": "python", "python": { "importLinter": false } }\n',
    });
    writeFiles(root, { 'lint-imports.txt': BROKEN_CONTRACT });
    commit(root, 'break the contract');

    expect(run(root).exitCode).toBe(0);
  });
  it('reports an import-linter run that checked nothing as a tool error', () => {
    const root = pythonRepository({ '.importlinter': '[importlinter]\nroot_package = demo\n' });
    writeFiles(root, { 'lint-imports.txt': 'Could not find .importlinter.\n' });
    commit(root, 'make the tool fail');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        rule: 'import-linter-failed',
        path: '.',
        message: `lint-imports could not check the contracts:\nCould not find .importlinter.\n${linkSentence('pythonToolFails')}`,
      },
    ]);
  });
  it('fails on a new package cycle and a new import of a package the project does not list', () => {
    const from = (module, ...names) => ({ level: 0, module, names });
    const scan = (imports) => `${JSON.stringify(imports)}\n`;
    const root = pythonRepository({
      'src/orders/__init__.py': '',
      'src/orders/service.py': '',
      'src/billing/__init__.py': '',
      'src/billing/invoice.py': '',
      'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\ndependencies = []\n',
      'distributions.json': JSON.stringify({
        python: [3, 12],
        stdlib: [],
        modules: { yaml: ['PyYAML'] },
        entryPoints: [],
        optional: {},
        references: [],
      }),
      'import-scan.json': scan({ 'src/orders/service.py': [from('billing', 'invoice')] }),
    });
    expect(run(root).exitCode).toBe(0);
    writeFiles(root, {
      'import-scan.json': scan({
        'src/orders/service.py': [from('billing', 'invoice')],
        'src/billing/invoice.py': [from('orders', 'service'), from('yaml', 'safe_load')],
      }),
    });
    commit(root, 'import back and add yaml');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newFindings(result, 'package-cycle').map(({ path }) => path)).toEqual([
      'src/billing/__init__.py',
      'src/orders/__init__.py',
    ]);
    expect(newFindings(result, 'unlisted-dependency')).toEqual([
      {
        tool: 'dependencies',
        rule: 'unlisted-dependency',
        path: 'src/billing/invoice.py',
        identity: 'unlisted:pyyaml',
        message:
          'Package pyyaml is imported (as yaml) but not listed in pyproject.toml. Add it to the project dependencies (a dev dependency group for tests and tooling). If this is intended, add {"rule":"unlisted-dependency","paths":["src/billing/invoice.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });
});
