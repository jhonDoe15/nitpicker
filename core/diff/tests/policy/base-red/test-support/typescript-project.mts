import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../../shared/values/readers.mts';
import { checkoutModulePath } from '../../../../../../shared/paths/checkout-module.mjs';

const COMMAND_TIMEOUT_MS = 60_000;
const GATE_TIMEOUT_MS = 5 * 60_000;
const TSCONFIG =
  '{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"lib":["ES2022"],"types":[]},"include":["src","test"]}\n';

type ProjectFiles = Readonly<Record<string, string | undefined>>;

type GateOptions = {
  readonly base?: string | undefined;
  readonly analyzers?: readonly string[];
  readonly extraArguments?: readonly string[];
};

type Project = {
  readonly root: string;
  readonly output: string;
  readonly packageRoot: string;
};

type GateResult = {
  readonly exitCode: number | undefined;
  readonly text: string;
  readonly json: (name: string) => unknown;
  readonly enforceable: () => string[];
};

export type TypescriptProject = {
  readonly root: string;
  readonly commitBranch: (name: string, branchFiles: ProjectFiles, from: string) => void;
  readonly gate: (branch: string, options: GateOptions) => GateResult;
  readonly remove: () => void;
};

function run(command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  if (command === 'git' && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return { status: result.status, text: result.stdout + result.stderr };
}

function contained(base: string, name: string) {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

function writeFiles(root: string, files: ProjectFiles) {
  for (const [file, content] of Object.entries(files)) {
    const full = contained(root, file);
    if (content === undefined) {
      rmSync(full);
      continue;
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function git(root: string, ...args: readonly string[]) {
  return run('git', args, root);
}

function commitOnBranch({
  root,
  name,
  files,
  from,
}: {
  readonly root: string;
  readonly name: string;
  readonly files: ProjectFiles;
  readonly from: string;
}) {
  git(root, 'checkout', '-q', '-b', name, from);
  writeFiles(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

function readReport(outputRoot: string, name: string): unknown {
  return parseJson(readFileSync(contained(outputRoot, name), 'utf8'));
}

function enforceableFindings(outputRoot: string) {
  return listOf(readReport(outputRoot, 'new-findings.json'))
    .filter((finding) => fieldOf(finding, 'classification') === 'enforceable')
    .map(
      (finding) =>
        `${textOf(fieldOf(finding, 'tool'))} ${textOf(fieldOf(finding, 'rule'))} ${textOf(fieldOf(finding, 'path'))}`,
    );
}

function runGate({
  project,
  branch,
  options,
}: {
  readonly project: Project;
  readonly branch: string;
  readonly options: GateOptions;
}): GateResult {
  const { base, analyzers = ['coverage', 'crap'], extraArguments = [] } = options;
  git(project.root, 'checkout', '-q', branch);
  const outputRoot = path.join(
    project.output,
    `${branch}-${base ?? 'all'}-${String(analyzers.length)}-${String(extraArguments.length)}`,
  );
  const analyzerArguments = analyzers.flatMap((name: string) => ['--analyzer', name]);
  const result = spawnSync(
    'node',
    [
      checkoutModulePath(path.join(project.packageRoot, 'core/cli.mjs')),
      ...(base === undefined ? [] : ['--base', base]),
      ...[...analyzerArguments, ...extraArguments, '--output', outputRoot],
    ],
    { cwd: project.root, encoding: 'utf8', timeout: GATE_TIMEOUT_MS },
  );
  return {
    exitCode: result.status ?? undefined,
    text: result.stdout + result.stderr,
    json(name: string) {
      return readReport(outputRoot, name);
    },
    enforceable() {
      return enforceableFindings(outputRoot);
    },
  };
}

function initialiseRepository({
  root,
  firstBranch,
  files,
}: {
  readonly root: string;
  readonly firstBranch: string;
  readonly files: ProjectFiles;
}) {
  writeFiles(root, {
    '.gitignore': 'node_modules\n',
    'package.json': '{"name":"p","type":"module","private":true}\n',
    'tsconfig.json': TSCONFIG,
    ...files,
  });
  git(root, 'init', '-q', '-b', firstBranch);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Nitpicker Test');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', firstBranch);
}

export function createTypescriptProject({
  packageRoot,
  prefix,
  files,
  firstBranch = 'main',
}: {
  readonly packageRoot: string;
  readonly prefix: string;
  readonly files: ProjectFiles;
  readonly firstBranch?: string;
}): TypescriptProject {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-`)));
  const output = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-out-`)));
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  initialiseRepository({ root, firstBranch, files });
  const project: Project = { root, output, packageRoot };
  return {
    root,
    commitBranch(name: string, branchFiles: ProjectFiles, from: string) {
      commitOnBranch({ root, name, files: branchFiles, from });
    },
    gate(branch: string, options: GateOptions) {
      return runGate({ project, branch, options });
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
    },
  };
}
