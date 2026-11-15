import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { testFileMatcher } from '../../../adapters/analysis/python-sources.mjs';
import { designDistributions } from '../../../adapters/analysis/design/design-distributions.mjs';
import type {
  DesignFacts,
  DesignOptions,
  DesignReport,
  DesignEntry,
} from '../typed/design-fact-types.mts';
import { byText } from '../../../../../shared/text-order/by-text.mjs';

const RUN_SCRIPT = path.resolve(import.meta.dirname, '../run.py');
const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const REPORT = 'design-facts.json';

const readReport: (text: string) => DesignReport = JSON.parse;
const readJson: (text: string) => unknown = JSON.parse;
const matcherOf: (projectRoot: string) => (file: string) => boolean = testFileMatcher;
const distributionsOf: (projectRoot: string, files: readonly string[]) => unknown =
  designDistributions;
const checkFacts: (facts: unknown) => unknown = validateFacts;

function pythonFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.py'))
    .map((file) => file.split(path.sep).join('/'))
    .sort(byText);
}

function runDesignScript(
  projectRoot: string,
  { entryFiles = [] }: DesignOptions = {},
): DesignReport {
  const files = pythonFiles(projectRoot);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  try {
    const list = path.join(work, 'files.txt');
    const options = path.join(work, 'options.json');
    writeFileSync(list, files.join('\n'));
    const isTest = matcherOf(projectRoot);
    writeFileSync(
      options,
      JSON.stringify({
        sourceRoots: ['.'],
        designFiles: files,
        testFiles: files.filter(isTest),
        entryFiles,
        distributions: distributionsOf(projectRoot, files),
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
    return readReport(readFileSync(path.join(work, REPORT), 'utf8'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const RULES_ROOT = path.resolve(import.meta.dirname, '../../');

export function runProducerPython(code: string): unknown {
  const prelude = `import sys\nsys.path.insert(0, ${JSON.stringify(RULES_ROOT)})\n`;
  const result = spawnSync('python3', ['-I', '-c', prelude + code], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`producer script exited ${String(result.status)}: ${result.stderr}`);
  }
  return readJson(result.stdout);
}

export function designFactsIn(projectRoot: string): DesignFacts {
  const report = runDesignScript(projectRoot);
  if (report.error !== undefined) {
    throw new Error(`design producer failed: ${report.error}`);
  }
  checkFacts(report.facts);
  return report.facts;
}

export function designFacts(fixture: string, options?: DesignOptions): DesignFacts {
  const report = runDesignScript(path.join(FIXTURES, fixture), options);
  if (report.error !== undefined) {
    throw new Error(`design producer failed: ${report.error}`);
  }
  checkFacts(report.facts);
  return report.facts;
}

function entryOf(entries: readonly DesignEntry[], id: string): DesignEntry {
  const found = entries.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`no design fact ${id}`);
  }
  return found;
}

export function factsById(facts: DesignFacts): {
  type: (id: string) => DesignEntry;
  callable: (id: string) => DesignEntry;
} {
  return {
    type: (id: string) => entryOf(facts.types, id),
    callable: (id: string) => entryOf(facts.callables, id),
  };
}
