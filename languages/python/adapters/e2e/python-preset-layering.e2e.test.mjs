import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../core/command/test-support/accepted-digest.mjs';
import { LAYERED_FILES, ORDER_TOTAL } from './test-support/python-preset-data.mjs';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from './test-support/python-e2e-support.mjs';

const IMPORT_LINTER_OFF_CONFIG =
  '{ "preset": "python", "disable": ["mutation"], "python": { "importLinter": false } }\n';

describe.skipIf(!pythonE2eEnabled)(
  'Python duplicates, coupling and import contracts end to end',
  () => {
    let project;
    const enforceable = (result) =>
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .sort((left, right) =>
          `${left.tool}${left.identity}`.localeCompare(`${right.tool}${right.identity}`),
        );
    const newRules = (result) => enforceable(result).map(({ tool, rule }) => `${tool} ${rule}`);
    beforeAll(() => {
      project = repository();
      write(project, LAYERED_FILES);
      initializeRepository(project, 'layered base');
      installPackages(project, ['coverage', 'pytest', 'import-linter']);
      commitBranch(project, 'clean', {
        'src/shop/web/views.py': `${LAYERED_FILES['src/shop/web/views.py']}\n\ndef hide(amounts: list[float]) -> int:\n    return len(amounts)\n`,
      });
      commitBranch(project, 'copy', {
        'src/shop/domain/bulk.py': ORDER_TOTAL.replace('order_total', 'bulk_total'),
        'tests/test_bulk.py':
          'from shop.domain import bulk\n\n\ndef test_bulk_total():\n    assert bulk.bulk_total([(2, 3), (0, 1)], 5) == 1\n    assert bulk.bulk_total([(0, 1)], 5) == 0\n',
      });
      commitBranch(project, 'upward-import', {
        'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
      });
      commitBranch(project, 'contracts-off', {
        'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
        'nitpicker.config.json': IMPORT_LINTER_OFF_CONFIG,
      });
    });
    afterAll(removeRepositories);
    it('passes a change that keeps the layering and adds no copy', () => {
      const result = gate(project, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools[0].version).toMatch(
        /;jscpd@[\d.]+;import-linter@[\d.]+$/,
      );
    });
    it('fails a copied function as a duplicate against the original', () => {
      const result = gate(project, 'copy');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        enforceable(result).map(({ tool, rule, path: file, message }) => ({
          tool,
          rule,
          file,
          message,
        })),
      ).toEqual([
        {
          tool: 'duplicates',
          rule: 'duplicate-clone',
          file: 'src/shop/domain/bulk.py',
          message:
            'This code repeats src/shop/domain/pricing.py:5 (10 lines). Keep one copy and call it from both places. To allow it for some paths, add a "python.exceptions" entry for duplicate-clone in nitpicker.config.json.',
        },
      ]);
    });
    it('fails a stable package importing an unstable one, the cycle it closes and the contract it breaks', () => {
      const result = gate(project, 'upward-import');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        enforceable(result).map(({ rule, path: file, identity }) => ({ rule, file, identity })),
      ).toEqual([
        ...['domain', 'infra', 'web'].map((name) => ({
          rule: 'package-cycle',
          file: `src/shop/${name}/__init__.py`,
          identity: `cycle:shop.${name}`,
        })),
        {
          rule: 'stability-direction',
          file: 'src/shop/domain/__init__.py',
          identity: 'package-edge:shop.domain->shop.web',
        },
        {
          rule: 'contract-broken',
          file: 'src/shop/domain/pricing.py',
          identity: 'contract:Domain is pure:shop.domain.pricing -> shop.web.views',
        },
        {
          rule: 'contract-broken',
          file: 'src/shop/domain/pricing.py',
          identity:
            'contract:Domain is pure:shop.domain.pricing -> shop.web.views -> shop.infra.store',
        },
      ]);
    });
    it('does not run the contracts when the config turns import-linter off', () => {
      const digest = acceptedDigest(['python.importLinter: not set -> false'], {
        'nitpicker.config.json': IMPORT_LINTER_OFF_CONFIG,
      });
      const result = gate(project, 'contracts-off', {
        environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: digest },
      });

      expect(newRules(result)).toEqual([
        'coupling package-cycle',
        'coupling package-cycle',
        'coupling package-cycle',
        'coupling stability-direction',
      ]);
      expect(result.json('summary.json').tools[0].version).not.toContain('import-linter');
    });
  },
);
