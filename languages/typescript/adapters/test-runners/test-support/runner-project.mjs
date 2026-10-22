import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { TESTS_FAILED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { parseArguments } from '../../quality-areas/arguments.mjs';
import { runQualityArea } from '../../quality-areas-runner.mjs';

function writeProjectFile(root, file, text) {
  const target = path.resolve(root, file);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Test project file is outside the project: ${file}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof text === 'string' ? text : JSON.stringify(text));
}

export function createRunnerProjects() {
  const parents = [];
  return {
    project(files, { linkDependencies = true } = {}) {
      const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
      parents.push(parent);
      const root = path.join(parent, 'head');
      for (const [file, text] of Object.entries(files)) {
        writeProjectFile(root, file, text);
      }
      if (linkDependencies) {
        symlinkSync(
          path.join(PACKAGE_ROOT, 'node_modules'),
          path.join(root, 'node_modules'),
          'dir',
        );
      }
      return root;
    },
    remove() {
      for (const parent of parents.splice(0)) {
        rmSync(parent, { recursive: true, force: true });
      }
    },
  };
}

export function runArea(kind, projectRoot) {
  return runQualityArea(
    parseArguments([
      ...['--analyzer-name', kind, '--kind', kind],
      ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
      ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
    ]),
  );
}

export function rulesOf(findings) {
  return findings.map(({ rule, classification }) => `${classification}:${rule}`);
}

export const PICK_SOURCE = [
  'export function pick(flag: boolean): string {',
  '  if (flag) {',
  "    return 'yes';",
  '  }',
  "  return 'no';",
  '}',
  '',
].join('\n');

export const PICK_JS_SOURCE = PICK_SOURCE.replace('(flag: boolean): string', '(flag)');

export const UNCOVERED_ELSE =
  'Branch coverage is 50.00%; minimum is 95%. Not taken: the false arm of the if (or its else) at 2:3.';

const PRINTED = /^Tests print new console output: (.*?)\. Fix the cause/u;

async function consoleFindings(projectRoot) {
  const failures = (await runArea('coverage', projectRoot)).filter(
    ({ rule }) => rule === TESTS_FAILED_RULE,
  );
  if (failures.length > 0) {
    throw new Error(failures.map(({ message }) => message).join('\n'));
  }
  return runArea('test-console', projectRoot);
}

function printedRows(findings) {
  return findings.map(({ rule, path: file, message }) => [rule, file, PRINTED.exec(message)?.[1]]);
}

export async function consoleOutput(projectRoot) {
  return printedRows(await consoleFindings(projectRoot));
}

export async function newConsoleOutput({ base, head }) {
  const { newFindings } = compareFindings({
    baseFindings: await consoleFindings(base),
    headFindings: await consoleFindings(head),
  });
  return printedRows(newFindings);
}

export const JAVASCRIPT_PRESET = { preset: 'javascript' };
