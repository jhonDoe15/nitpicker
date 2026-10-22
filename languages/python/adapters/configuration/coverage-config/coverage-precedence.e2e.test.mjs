import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { COVERAGE_REPORT, test as runTests } from '../../test-runs/test-step.mjs';

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
const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-coverage-precedence-')));
  roots.push(root);
  return root;
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function install(environment) {
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
  let environment;

  beforeAll(() => {
    environment = path.join(temporaryRoot(), 'venv');
    install(environment);
  }, INSTALL_TIMEOUT_MS * 2);
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function uncovered(precedence, { policyFiles } = {}) {
    const projectRoot = temporaryRoot();
    const reportRoot = temporaryRoot();
    const files = {
      'src/shop/__init__.py': '',
      'src/shop/core.py': CORE,
      'tests/test_core.py': TEST,
    };
    write(
      projectRoot,
      policyFiles === undefined ? { ...files, 'pyproject.toml': PYPROJECT } : files,
    );
    const policyRoot = policyFiles === undefined ? projectRoot : temporaryRoot();
    write(policyRoot, policyFiles ?? {});
    const context = createToolContext({
      projectRoot,
      liveRoot: projectRoot,
      settings: { environment, sourceRoots: ['src'], testRunner: 'pytest' },
      reportRoot,
      policyRoot,
      toolPrecedence: precedence === undefined ? undefined : { coverage: precedence },
    });
    runTests(context, {});
    const report = JSON.parse(readFileSync(path.join(reportRoot, COVERAGE_REPORT), 'utf8'));
    const [core] = Object.entries(report.files).filter(([file]) => file.endsWith('core.py'));
    return core[1].missing_lines;
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

  it('reads the exclusions of the head checkout for the base snapshot', () => {
    expect(
      uncovered(['project', 'nitpicker'], { policyFiles: { 'pyproject.toml': PYPROJECT } }),
    ).toEqual([]);
  });
});
