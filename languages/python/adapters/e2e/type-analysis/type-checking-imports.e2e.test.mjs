import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAYERED_FILES } from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from '../test-support/python-e2e-support.mjs';

const IMPORT_LINTER_OFF =
  '{ "preset": "python", "disable": ["mutation"], "python": { "importLinter": false } }\n';
const TYPE_CHECKING_FILES = {
  'src/shop/domain/pricing.py': `from typing import TYPE_CHECKING\n\nif TYPE_CHECKING:\n    from shop.web import views\n\n\n${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    return "ok"\n\n\ndef shown(page: "views.Page") -> str:\n    return str(page)\n`,
  'src/shop/web/views.py': `${LAYERED_FILES['src/shop/web/views.py']}\n\nclass Page:\n    title = "shop"\n`,
};

describe.skipIf(!pythonE2eEnabled)('Python imports under if TYPE_CHECKING end to end', () => {
  let project;

  const newRules = (result) =>
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable')
      .map(({ tool, rule }) => `${tool} ${rule}`);

  beforeAll(() => {
    project = repository();
    write(project, LAYERED_FILES);
    initializeRepository(project, 'layered base');
    installPackages(project, ['coverage', 'pytest', 'import-linter']);
    commitBranch(project, 'stability', {
      ...TYPE_CHECKING_FILES,
      'nitpicker.config.json': IMPORT_LINTER_OFF,
    });
    commitBranch(project, 'contract', TYPE_CHECKING_FILES);
    commitBranch(project, 'contract-excluded', {
      ...TYPE_CHECKING_FILES,
      '.importlinter': LAYERED_FILES['.importlinter'].replace(
        'root_package = shop\n',
        'root_package = shop\nexclude_type_checking_imports = True\n',
      ),
    });
  });

  afterAll(removeRepositories);

  it('does not count an import under if TYPE_CHECKING as a stability inversion', () => {
    const result = gate(project, 'stability');

    expect(result.exitCode, result.text).toBe(0);
    expect(newRules(result)).toEqual([]);
  });

  it('leaves an import under if TYPE_CHECKING to the project contracts', () => {
    const broken = gate(project, 'contract');
    const excluded = gate(project, 'contract-excluded');

    expect(broken.exitCode, broken.text).toBe(1);
    expect(newRules(broken)).toEqual([
      'import-linter contract-broken',
      'import-linter contract-broken',
    ]);
    expect(excluded.exitCode, excluded.text).toBe(0);
    expect(newRules(excluded)).toEqual([]);
  });
});
