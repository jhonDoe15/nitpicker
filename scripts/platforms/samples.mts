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
import { containedPath } from '../../core/fix/common/contained-path.mjs';

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

type Files = Readonly<Record<string, string>>;

type SampleChange = { readonly files?: Files; readonly append?: Files };

export type Sample = {
  readonly allExitCode: number;
  readonly sources: readonly string[];
  readonly removed?: readonly string[];
  readonly files?: Files;
  readonly linkNodeModules: boolean;
  readonly pythonEnvironment?: readonly string[];
  readonly change: SampleChange;
};

export type SampleRepository = {
  readonly root: string;
  readonly change: () => void;
  readonly remove: () => void;
};

const SAMPLES: Readonly<Record<string, Sample>> = {
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
    linkNodeModules: false,
    sources: [GRADLE_PROJECT],
    files: { '.gitignore': 'build/\n.gradle/\nreports/\n', 'nitpicker.config.json': JAVA_CONFIG },
    change: { files: { 'src/main/java/demo/Parser.java': SWALLOWED_JAVA } },
  },
  maven: {
    allExitCode: 1,
    linkNodeModules: false,
    sources: [GRADLE_PROJECT, 'languages/java/maven/fixtures/single'],
    removed: ['build.gradle', 'settings.gradle'],
    files: { '.gitignore': 'target/\nreports/\n', 'nitpicker.config.json': JAVA_CONFIG },
    change: { files: { 'src/main/java/demo/Parser.java': SWALLOWED_JAVA } },
  },
  python: {
    allExitCode: 1,
    linkNodeModules: false,
    sources: ['languages/python/adapters/fixtures/python-project'],
    files: {
      '.gitignore': '.venv/\n__pycache__/\n.pytest_cache/\n.ruff_cache/\nmutants/\nreports/\n',
    },
    pythonEnvironment: ['-e', '.', 'coverage', 'mutmut', 'mypy', 'pytest', 'ruff'],
    change: { files: { 'src/demo/parser.py': SWALLOWED_PYTHON } },
  },
};

const COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

const GIT_IDENTITY = [
  '-c',
  'user.name=nitpicker',
  '-c',
  'user.email=nitpicker@example.com',
  '-c',
  'commit.gpgsign=false',
];

function runCommand(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: COMMAND_TIMEOUT_MS,
  });
}

function runGit(args: readonly string[], cwd: string): string {
  return runCommand('git', [...GIT_IDENTITY, ...args], cwd);
}

function writeFiles(root: string, files: Files = {}): void {
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(containedPath(root, name), text);
  }
}

function applyChange(root: string, { files, append = {} }: SampleChange): void {
  writeFiles(root, files);
  for (const [name, text] of Object.entries(append)) {
    appendFileSync(containedPath(root, name), text);
  }
}

function commitAll(root: string, message: string): void {
  runGit(['add', '-A'], root);
  runGit(['commit', '-q', '-m', message], root);
}

function installPythonEnvironment(root: string, packages: readonly string[]): void {
  runCommand('uv', ['venv', '-q', '.venv'], root);
  runCommand('uv', ['pip', 'install', '-q', '--python', '.venv', ...packages], root);
}

function copySample(root: string, sample: Sample): void {
  for (const source of sample.sources) {
    cpSync(containedPath(REPOSITORY_ROOT, source), root, { recursive: true });
  }
  for (const removed of sample.removed ?? []) {
    rmSync(containedPath(root, removed));
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

export function sampleNamed(name: string): Sample {
  const sample = SAMPLES[name];
  if (!Object.hasOwn(SAMPLES, name) || sample === undefined) {
    throw new Error(`Unknown sample ${name}; choose one of ${Object.keys(SAMPLES).join(', ')}`);
  }
  return sample;
}

export function createSampleRepository(name: string): SampleRepository {
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
