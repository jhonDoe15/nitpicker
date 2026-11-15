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
} from '../../../../adapters/analysis/python-ast-rules.mts';
import { ruffFindings } from '../../../../adapters/python-reports.mts';
import { RUFF_REPORT, lint } from '../../../../adapters/python-tools.mts';
import type { IngestedFinding } from '../../../../ingest/typed/ingest-types.mts';
import { createToolContext } from '../../../../adapters/test-support/typed/tool-context.mts';
import { PROBE_TIMEOUT_MS } from '../../../../../../shared/processes/deadlines.mjs';

const RULES_DIR = path.resolve(import.meta.dirname, '../../..');

export type RuleRow = {
  readonly rule: string;
  readonly path: string;
  readonly line: number;
  readonly subject: string;
  readonly error?: string;
};
type Sidecar = { readonly allowed: readonly unknown[]; readonly supportFiles: readonly string[] };
type Interpreter = { readonly command: string; readonly files: Record<string, string> };
const parseRules: (text: string) => RuleRow[] = JSON.parse;
const parseSidecar: (text: string) => Sidecar = JSON.parse;
const testFilesOf: (root: string) => string[] = readTestFiles;
const parseJson: (text: string) => unknown = JSON.parse;

function inside(root: string, file: string) {
  const target = path.resolve(root, file);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${file} is outside ${root}`);
  }
  return target;
}

function writeFiles(root: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    const target = inside(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function readText(root: string, name: string): string {
  return readFileSync(inside(root, name), 'utf8');
}

function folder(roots: string[], prefix: string) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function analyse(
  roots: string[],
  files: Record<string, string>,
  { ruff }: { ruff: boolean } = { ruff: false },
): {
  rules: RuleRow[];
  sidecar: Sidecar;
  ruff: IngestedFinding[];
} {
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
  const rules = parseRules(readText(reportRoot, RULES_REPORT));
  const sidecar = parseSidecar(readText(reportRoot, ALLOWANCES_REPORT));
  if (!ruff) {
    return { rules, sidecar, ruff: [] };
  }
  lint(context);
  const found = ruffFindings(parseJson(readText(reportRoot, RUFF_REPORT)), {
    roots: [projectRoot],
    projectRoot,
    testFiles: testFilesOf(reportRoot),
    ...readAllowances(reportRoot),
  });
  return { rules, sidecar, ruff: found };
}

function python(roots: string[], { command, files, lines }: Interpreter & { lines: string[] }) {
  const projectRoot = folder(roots, 'nitpicker-runner-script-');
  writeFiles(projectRoot, files);
  const code = ['import sys', `sys.path.insert(0, ${JSON.stringify(RULES_DIR)})`, ...lines];
  const run = spawnSync(command, ['-I', '-B', '-c', code.join('\n')], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  });
  return { ...run, projectRoot };
}

function script(
  roots: string[],
  { command, files, prelude = '' }: Interpreter & { prelude?: string | undefined },
) {
  const listed = { ...files, 'files.txt': Object.keys(files).join('\n') };
  const call = `nitpicker_rules.main(["files.txt", ${JSON.stringify(RULES_REPORT)}])`;
  const run = python(roots, {
    command,
    files: listed,
    lines: ['import nitpicker_rules', prelude, call],
  });
  return { ...run, rules: parseRules(readText(run.projectRoot, RULES_REPORT)) };
}

export type Projects = {
  readonly analyse: (
    files: Record<string, string>,
    options?: { ruff: boolean },
  ) => ReturnType<typeof analyse>;
  readonly cleanup: () => void;
  readonly python: (
    command: string,
    files: Record<string, string>,
    lines: string[],
  ) => ReturnType<typeof python>;
  readonly script: (
    command: string,
    files: Record<string, string>,
    prelude?: string,
  ) => ReturnType<typeof script>;
};

export function createProjects(): Projects {
  const roots: string[] = [];
  return {
    analyse: (files: Record<string, string>, options?: { ruff: boolean }) =>
      analyse(roots, files, options),
    cleanup: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
    python: (command: string, files: Record<string, string>, lines: string[]) =>
      python(roots, { command, files, lines }),
    script: (command: string, files: Record<string, string>, prelude?: string) =>
      script(roots, { command, files, prelude }),
  };
}

export function interpreter(version: string): string | undefined {
  const candidates: (readonly [string, string[]])[] = [
    [`python${version}`, []],
    ['uv', ['python', 'find', '--no-project', version]],
  ];
  for (const [command, args] of candidates) {
    const run = spawnSync(command, args.length === 0 ? ['--version'] : args, {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
    });
    if (run.status === 0) {
      return args.length === 0 ? command : run.stdout.trim();
    }
  }
  return undefined;
}

export function rowsOf(rules: readonly RuleRow[], wanted: readonly string[]): string[] {
  return rules
    .filter(({ rule }) => wanted.includes(rule))
    .map(({ rule, path: file, line, subject }) => `${rule} ${file}:${String(line)} ${subject}`);
}
