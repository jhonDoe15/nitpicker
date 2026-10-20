import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
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

export const UNCOVERED_ELSE =
  'Branch coverage is 50.00%; minimum is 95%. Not taken: the false arm of the if (or its else) at 2:3.';
