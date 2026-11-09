import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { testFileMatcher } from '../../../adapters/analysis/python-sources.mjs';
import { designDistributions } from '../../../adapters/analysis/design/design-distributions.mjs';

const RUN_SCRIPT = path.resolve(import.meta.dirname, '../run.py');
const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const REPORT = 'design-facts.json';

function pythonFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((file) => file.endsWith('.py'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
}

function runDesignScript(projectRoot, { entryFiles = [] } = {}) {
  const files = pythonFiles(projectRoot);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  try {
    const list = path.join(work, 'files.txt');
    const options = path.join(work, 'options.json');
    writeFileSync(list, files.join('\n'));
    const isTest = testFileMatcher(projectRoot);
    writeFileSync(
      options,
      JSON.stringify({
        sourceRoots: ['.'],
        designFiles: files,
        testFiles: files.filter(isTest),
        entryFiles,
        distributions: designDistributions(projectRoot, files),
      }),
    );
    const result = spawnSync(
      'python3',
      ['-I', RUN_SCRIPT, list, path.join(work, 'rules.json'), options],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    if (result.status !== 0) {
      throw new Error(`design script exited ${String(result.status)}: ${result.stderr}`);
    }
    return JSON.parse(readFileSync(path.join(work, REPORT), 'utf8'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const RULES_ROOT = path.resolve(import.meta.dirname, '../../');

export function runProducerPython(code) {
  const prelude = `import sys\nsys.path.insert(0, ${JSON.stringify(RULES_ROOT)})\n`;
  const result = spawnSync('python3', ['-I', '-c', prelude + code], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`producer script exited ${String(result.status)}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

export function designFactsIn(projectRoot) {
  const report = runDesignScript(projectRoot);
  if (report.error !== undefined) {
    throw new Error(`design producer failed: ${report.error}`);
  }
  validateFacts(report.facts);
  return report.facts;
}

export function designFacts(fixture, options) {
  const report = runDesignScript(path.join(FIXTURES, fixture), options);
  if (report.error !== undefined) {
    throw new Error(`design producer failed: ${report.error}`);
  }
  validateFacts(report.facts);
  return report.facts;
}

export function factsById(facts) {
  return {
    type: (id) => facts.types.find((entry) => entry.id === id),
    callable: (id) => facts.callables.find((entry) => entry.id === id),
  };
}
