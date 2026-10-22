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

const COMMAND_TIMEOUT_MS = 60_000;
const GATE_TIMEOUT_MS = 5 * 60_000;
const TSCONFIG =
  '{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"lib":["ES2022"],"types":[]},"include":["src","test"]}\n';

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  if (command === 'git' && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return { status: result.status, text: result.stdout + result.stderr };
}

function contained(base, name) {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const full = contained(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function git(root, ...args) {
  return run('git', args, root);
}

function commitOnBranch({ root, name, files, from }) {
  git(root, 'checkout', '-q', '-b', name, from);
  writeFiles(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

function readReport(outputRoot, name) {
  return JSON.parse(readFileSync(contained(outputRoot, name), 'utf8'));
}

function enforceableFindings(outputRoot) {
  return readReport(outputRoot, 'new-findings.json')
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
}

function runGate({ project, branch, options }) {
  const { base, analyzers = ['coverage', 'crap'], extraArguments = [] } = options;
  git(project.root, 'checkout', '-q', branch);
  const outputRoot = path.join(project.output, `${branch}-${base}-${extraArguments.length}`);
  const analyzerArguments = analyzers.flatMap((name) => ['--analyzer', name]);
  const result = spawnSync(
    'node',
    [
      path.join(project.packageRoot, 'core/cli.mjs'),
      ...['--base', base, ...analyzerArguments, ...extraArguments, '--output', outputRoot],
    ],
    { cwd: project.root, encoding: 'utf8', timeout: GATE_TIMEOUT_MS },
  );
  return {
    exitCode: result.status,
    text: result.stdout + result.stderr,
    json(name) {
      return readReport(outputRoot, name);
    },
    enforceable() {
      return enforceableFindings(outputRoot);
    },
  };
}

function initialiseRepository({ root, firstBranch, files }) {
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

export function createTypescriptProject({ packageRoot, prefix, files, firstBranch = 'main' }) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-`)));
  const output = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-out-`)));
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  initialiseRepository({ root, firstBranch, files });
  const project = { root, output, packageRoot };
  return {
    root,
    commitBranch(name, branchFiles, from) {
      commitOnBranch({ root, name, files: branchFiles, from });
    },
    gate(branch, options) {
      return runGate({ project, branch, options });
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
    },
  };
}
