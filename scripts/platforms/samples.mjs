import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInside } from '../../shared/conventions/read-inside.mjs';

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const GRADLE_PROJECT = 'languages/java/adapters/fixtures/gradle-project';
const JAVA_CONFIG = `${JSON.stringify({ preset: 'java' })}\n`;
const SWALLOWED_JAVA = `package demo;

public final class Parser {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;
const SWALLOWED_PYTHON = `def parse(text: str) -> int:
    try:
        return int(text)
    except ValueError:
        pass
    return 0
`;

export const SAMPLES = {
  typescript: {
    allExitCode: 0,
    sources: ['languages/typescript/preset/fixtures/strict-clean'],
    files: { '.gitignore': '/node_modules\nreports/\n' },
    linkNodeModules: true,
    change: {
      append: {
        'src/main/features/greeting/domain/greet.ts':
          "\nexport const widened = ['a'] as readonly string[];\n",
      },
    },
  },
  gradle: {
    allExitCode: 1,
    sources: [GRADLE_PROJECT],
    files: { '.gitignore': 'build/\n.gradle/\nreports/\n', 'nitpicker.config.json': JAVA_CONFIG },
    change: { files: { 'src/main/java/demo/Parser.java': SWALLOWED_JAVA } },
  },
  maven: {
    allExitCode: 1,
    sources: [GRADLE_PROJECT, 'languages/java/maven/fixtures/single'],
    removed: ['build.gradle', 'settings.gradle'],
    files: { '.gitignore': 'target/\nreports/\n', 'nitpicker.config.json': JAVA_CONFIG },
    change: { files: { 'src/main/java/demo/Parser.java': SWALLOWED_JAVA } },
  },
  python: {
    allExitCode: 1,
    sources: ['languages/python/adapters/fixtures/python-project'],
    files: {
      '.gitignore': '.venv/\n__pycache__/\n.pytest_cache/\n.ruff_cache/\nmutants/\nreports/\n',
    },
    pythonEnvironment: ['-e', '.', 'coverage', 'mutmut', 'mypy', 'pytest', 'ruff'],
    change: { files: { 'src/demo/parser.py': SWALLOWED_PYTHON } },
  },
};

const GIT_IDENTITY = [
  '-c',
  'user.name=nitpicker',
  '-c',
  'user.email=nitpicker@example.com',
  '-c',
  'commit.gpgsign=false',
];

function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function runGit(args, cwd) {
  return runCommand('git', [...GIT_IDENTITY, ...args], cwd);
}

export function inside(base, name) {
  const full = resolveInside(base, name);
  if (full === undefined) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

function writeFiles(root, files = {}) {
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(inside(root, name), text);
  }
}

function applyChange(root, { files, append = {} }) {
  writeFiles(root, files);
  for (const [name, text] of Object.entries(append)) {
    appendFileSync(inside(root, name), text);
  }
}

function commitAll(root, message) {
  runGit(['add', '-A'], root);
  runGit(['commit', '-q', '-m', message], root);
}

function installPythonEnvironment(root, packages) {
  runCommand('uv', ['venv', '-q', '.venv'], root);
  runCommand('uv', ['pip', 'install', '-q', '--python', '.venv', ...packages], root);
}

function copySample(root, sample) {
  for (const source of sample.sources) {
    cpSync(inside(REPOSITORY_ROOT, source), root, { recursive: true });
  }
  for (const removed of sample.removed ?? []) {
    rmSync(inside(root, removed));
  }
  writeFiles(root, sample.files);
  if (sample.linkNodeModules) {
    symlinkSync(
      path.join(REPOSITORY_ROOT, 'node_modules'),
      path.join(root, 'node_modules'),
      'junction',
    );
  }
}

function sampleNamed(name) {
  if (!Object.hasOwn(SAMPLES, name)) {
    throw new Error(`Unknown sample ${name}; choose one of ${Object.keys(SAMPLES).join(', ')}`);
  }
  return SAMPLES[name];
}

export function createSampleRepository(name) {
  const sample = sampleNamed(name);
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), `nitpicker-platform-${name}-`)));
  copySample(root, sample);
  runGit(['init', '-q', '-b', 'main'], root);
  commitAll(root, 'sample');
  if (sample.pythonEnvironment !== undefined) {
    installPythonEnvironment(root, sample.pythonEnvironment);
  }
  return {
    root,
    change() {
      runGit(['checkout', '-q', '-b', 'change'], root);
      applyChange(root, sample.change);
      commitAll(root, 'change');
    },
    remove() {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    },
  };
}
