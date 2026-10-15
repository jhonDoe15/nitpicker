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

const HERMETIC_GIT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const TSCONFIG =
  '{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"lib":["ES2022"],"types":[]},"include":["src","test"]}\n';

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...HERMETIC_GIT },
  });
  if (command === 'git' && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return { status: result.status, text: result.stdout + result.stderr };
}

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

export function createTypescriptProject({ packageRoot, prefix, files, firstBranch = 'main' }) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-`)));
  const output = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix}-out-`)));
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, {
    '.gitignore': 'node_modules\n',
    'package.json': '{"name":"p","type":"module","private":true}\n',
    'tsconfig.json': TSCONFIG,
    ...files,
  });
  const git = (...args) => run('git', args, root);
  git('init', '-q', '-b', firstBranch);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Nitpicker Test');
  git('add', '-A');
  git('commit', '-q', '-m', firstBranch);
  return {
    root,
    commitBranch(name, branchFiles, from) {
      git('checkout', '-q', '-b', name, from);
      writeFiles(root, branchFiles);
      git('add', '-A');
      git('commit', '-q', '-m', name);
    },
    gate(
      branch,
      { base, analyzers = ['coverage', 'crap'], extraArguments = [], environment = {} },
    ) {
      git('checkout', '-q', branch);
      const outputRoot = path.join(output, `${branch}-${base}-${extraArguments.length}`);
      const result = spawnSync(
        'node',
        [
          path.join(packageRoot, 'core/cli.mjs'),
          '--base',
          base,
          ...analyzers.flatMap((name) => ['--analyzer', name]),
          ...extraArguments,
          '--output',
          outputRoot,
        ],
        { cwd: root, encoding: 'utf8', env: { ...process.env, ...environment } },
      );
      const json = (name) => JSON.parse(readFileSync(path.join(outputRoot, name), 'utf8'));
      const enforceable = () =>
        json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable')
          .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
      return { exitCode: result.status, text: result.stdout + result.stderr, json, enforceable };
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
    },
  };
}
