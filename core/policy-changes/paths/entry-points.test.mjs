import { describe, expect, it } from 'vitest';
import { between, changesOf } from '../build-files/test-support/policy-fixtures.mjs';

const TYPESCRIPT = {
  'package.json': '{"name":"shop","type":"module"}\n',
  'src/total.ts': "import { rate } from './tax';\nexport const total = rate * 2;\n",
  'src/tax.ts': 'export const rate = 2;\n',
  'scripts/report.ts': "import { total } from '../src/total';\nconsole.log(total);\n",
};
const PYTHON = {
  'pyproject.toml': '[project]\nname = "shop"\n',
  'src/shop/__init__.py': '',
  'src/shop/total.py': 'from shop.tax import RATE\n\nTOTAL = RATE * 2\n',
  'src/shop/tax.py': 'RATE = 2\n',
  'src/shop/jobs.py': 'from shop.total import TOTAL\n\nprint(TOTAL)\n',
  'src/shop/test_jobs.py':
    'from shop.jobs import TOTAL\n\n\ndef test_total():\n    assert TOTAL == 4\n',
};

function typescript(entryPoints) {
  return between({
    base: TYPESCRIPT,
    head: TYPESCRIPT,
    baseConfig: { layout: { sourceRoots: ['src', 'scripts'] } },
    config: { layout: { sourceRoots: ['src', 'scripts'], entryPoints } },
  });
}

function python(entryPoints) {
  const config = { preset: 'python', python: { sourceRoots: ['src'] } };
  return between({
    base: PYTHON,
    head: PYTHON,
    baseConfig: config,
    config: { ...config, python: { ...config.python, entryPoints } },
  });
}

describe('added entry points', () => {
  it('lists a script that no checked code imports without failing', () => {
    expect(changesOf(typescript(['scripts/report.ts']))).toEqual({
      policyLoosenings: [],
      policyChanges: ['layout.entryPoints added: scripts/report.ts'],
    });
    expect(changesOf(python(['src/shop/jobs.py']))).toEqual({
      policyLoosenings: [],
      policyChanges: ['python.entryPoints added: src/shop/jobs.py'],
    });
  });

  it('fails a glob that marks files checked code imports, naming only those files', () => {
    expect(typescript(['**']).policyLoosenings).toEqual([
      'layout.entryPoints added: ** (checked code imports src/tax.ts, src/total.ts)',
    ]);
    expect(python(['src/shop/*.py']).policyLoosenings).toEqual([
      'python.entryPoints added: src/shop/*.py (checked code imports src/shop/__init__.py, src/shop/tax.py, src/shop/total.py)',
    ]);
  });
});
