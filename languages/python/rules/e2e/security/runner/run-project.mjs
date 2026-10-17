import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALLOWANCES_REPORT,
  RULES_REPORT,
  checkRules,
  readAllowances,
  readTestFiles,
} from '../../../../adapters/analysis/python-ast-rules.mjs';
import { ruffFindings } from '../../../../adapters/python-reports.mjs';
import { RUFF_REPORT, createToolContext, lint } from '../../../../adapters/python-tools.mjs';

const RULES_DIR = path.resolve(import.meta.dirname, '../../..');

function inside(root, file) {
  const target = path.resolve(root, file);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${file} is outside ${root}`);
  }
  return target;
}

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = inside(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function readJson(root, name) {
  return JSON.parse(readFileSync(inside(root, name), 'utf8'));
}

function folder(roots, prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function analyse(roots, files, { ruff = false } = {}) {
  const projectRoot = folder(roots, 'nitpicker-runner-project-');
  const reportRoot = folder(roots, 'nitpicker-runner-report-');
  writeFiles(projectRoot, files);
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['.'] },
    reportRoot,
  });
  checkRules(context);
  const rules = readJson(reportRoot, RULES_REPORT);
  const sidecar = readJson(reportRoot, ALLOWANCES_REPORT);
  if (!ruff) {
    return { rules, sidecar };
  }
  lint(context);
  const found = ruffFindings(readJson(reportRoot, RUFF_REPORT), {
    roots: [projectRoot],
    projectRoot,
    testFiles: readTestFiles(reportRoot),
    ...readAllowances(reportRoot),
  });
  return { rules, sidecar, ruff: found };
}

function python(roots, { command, files, lines }) {
  const projectRoot = folder(roots, 'nitpicker-runner-script-');
  writeFiles(projectRoot, files);
  const code = ['import sys', `sys.path.insert(0, ${JSON.stringify(RULES_DIR)})`, ...lines];
  const run = spawnSync(command, ['-I', '-B', '-c', code.join('\n')], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return { ...run, projectRoot };
}

function script(roots, { command, files, prelude = '' }) {
  const listed = { ...files, 'files.txt': Object.keys(files).join('\n') };
  const call = `nitpicker_rules.main(["files.txt", ${JSON.stringify(RULES_REPORT)}])`;
  const run = python(roots, {
    command,
    files: listed,
    lines: ['import nitpicker_rules', prelude, call],
  });
  return { ...run, rules: readJson(run.projectRoot, RULES_REPORT) };
}

export function createProjects() {
  const roots = [];
  return {
    analyse: (files, options) => analyse(roots, files, options),
    cleanup: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
    python: (command, files, lines) => python(roots, { command, files, lines }),
    script: (command, files, prelude) => script(roots, { command, files, prelude }),
  };
}

export function interpreter(version) {
  const candidates = [
    [`python${version}`, []],
    ['uv', ['python', 'find', '--no-project', version]],
  ];
  for (const [command, args] of candidates) {
    const run = spawnSync(command, args.length === 0 ? ['--version'] : args, { encoding: 'utf8' });
    if (run.status === 0) {
      return args.length === 0 ? command : run.stdout.trim();
    }
  }
  return undefined;
}

export function rowsOf(rules, wanted) {
  return rules
    .filter(({ rule }) => wanted.includes(rule))
    .map(({ rule, path: file, line, subject }) => `${rule} ${file}:${String(line)} ${subject}`);
}
