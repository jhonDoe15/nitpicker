import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createToolContext } from '../../test-support/typed/tool-context.mts';
import { fieldOf, fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';
import { COVERAGE_REPORT, test as runTests } from '../../test-runs/test-step.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const INSTALL_TIMEOUT_MS = 180_000;
const CORE = [
  'def ship(order):',
  '    return "shipped" if order else "held"',
  '',
  '',
  'def legacy():  # pragma: no cover',
  '    return "unused"',
  '',
].join('\n');
const TEST = 'from shop.core import ship\n\n\ndef test_ship():\n    assert ship(1) == "shipped"\n';
const PYPROJECT = '[tool.coverage.report]\nexclude_also = ["pragma: no cover"]\n';
const UNRELATED = '[tool.coverage.report]\nshow_missing = true\n';
const SKIPPING = [
  '[tool.coverage.run]',
  'branch = false',
  'source = ["tests"]',
  '',
  '[tool.coverage.report]',
  'exclude_also = ["pragma: no cover"]',
  '',
].join('\n');
const roots: string[] = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-coverage-precedence-')));
  roots.push(root);
  return root;
}

function install(environment: string): void {
  for (const args of [
    ['venv', '-q', environment],
    ['pip', 'install', '-q', '--python', environment, 'coverage', 'pytest'],
  ]) {
    const result = spawnSync('uv', args, { encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS });
    if (result.status !== 0) {
      throw new Error(`uv ${args.join(' ')} failed: ${result.stderr}`);
    }
  }
}

describe.skipIf(!pythonE2eEnabled)('coverage with the project config end to end', () => {
  let environment: string;

  beforeAll(() => {
    environment = path.join(temporaryRoot(), 'venv');
    install(environment);
  });
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function measured(
    precedence: readonly string[] | undefined,
    {
      pyproject = PYPROJECT,
      policyFiles,
    }: { pyproject?: string; policyFiles?: Readonly<Record<string, string>> } = {},
  ) {
    const projectRoot = temporaryRoot();
    const reportRoot = temporaryRoot();
    const files = {
      'src/shop/__init__.py': '',
      'src/shop/core.py': CORE,
      'tests/test_core.py': TEST,
    };
    writeFiles(projectRoot, { ...files, 'pyproject.toml': pyproject });
    const policyRoot = policyFiles === undefined ? projectRoot : temporaryRoot();
    writeFiles(policyRoot, policyFiles ?? {});
    const context = createToolContext({
      projectRoot,
      liveRoot: projectRoot,
      settings: { environment, sourceRoots: ['src'], testRunner: 'pytest' },
      reportRoot,
      policyRoot,
      toolPrecedence: precedence === undefined ? undefined : { coverage: precedence },
    });
    runTests(context, {});
    const report = parseJson(readFileSync(path.join(reportRoot, COVERAGE_REPORT), 'utf8'));
    const [core] = Object.entries(fieldsOf(fieldOf(report, 'files'))).filter(([file]) =>
      file.endsWith('core.py'),
    );
    return {
      missing: fieldOf(core?.[1], 'missing_lines'),
      branches: fieldOf(fieldOf(report, 'meta'), 'branch_coverage'),
    };
  }

  function uncovered(
    precedence: readonly string[] | undefined,
    options?: Parameters<typeof measured>[1],
  ) {
    return measured(precedence, options).missing;
  }

  it('reports the pragma lines without the opt-in and with nitpicker first', () => {
    expect(uncovered(undefined)).toEqual([6]);
    expect(uncovered(['nitpicker'])).toEqual([6]);
    expect(uncovered(['nitpicker', 'project'])).toEqual([6]);
  });

  it('excludes the lines the project excludes when it is listed first', () => {
    expect(uncovered(['project', 'nitpicker'])).toEqual([]);
    expect(uncovered(['project'])).toEqual([]);
  });

  it('reads the exclusions of the head checkout for the base snapshot, not its own', () => {
    expect(
      uncovered(['project', 'nitpicker'], {
        pyproject: UNRELATED,
        policyFiles: { 'pyproject.toml': PYPROJECT },
      }),
    ).toEqual([]);
    expect(
      uncovered(['project', 'nitpicker'], {
        pyproject: PYPROJECT,
        policyFiles: { 'pyproject.toml': UNRELATED },
      }),
    ).toEqual([6]);
  });

  it('keeps measuring branches of the source roots when the project turns them off', () => {
    expect(measured(['project'], { pyproject: SKIPPING })).toEqual({ missing: [], branches: true });
    expect(measured(undefined, { pyproject: SKIPPING })).toEqual({ missing: [6], branches: true });
  });
});
