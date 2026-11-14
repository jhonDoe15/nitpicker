import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import { byText } from '../../../../shared/text-order/by-text.mjs';

const MARKER = 'nitpicker-fix-tool';
const TOOL_PROPERTY = '-Pnitpicker.fix.tools=';
const DEFAULTS_OPTION = '--editorconfig=';
const CLASS_ARGUMENTS_OFFSET = 3;

type Invocation = {
  readonly operation: string;
  readonly cwd: string;
  readonly args: readonly string[];
};

type Launch = {
  readonly jvmArgs: string[];
  readonly classpath: string | undefined;
  readonly mainClass: string | undefined;
  readonly args: string[];
};

type CommandResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

type FakeJvmTools = {
  readonly executeFixCommand: (invocation: Invocation) => CommandResult;
  readonly calls: Invocation[];
  readonly launches: (Launch & Record<string, unknown>)[];
  readonly operations: () => string[];
};
type FakeOptions = {
  readonly transform?: (content: string, file: string) => string;
  readonly failure?: Readonly<Record<string, CommandResult>>;
  readonly unparsable?: string;
};

function squeezed(source: string): string {
  return source.replaceAll(/ {2,}/g, ' ');
}

function parseArgumentFile(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((token) =>
      token
        .slice(1, -1)
        .replaceAll(String.raw`\"`, '"')
        .replaceAll('\\\\', '\\'),
    );
}

function gradleClasspaths(args: readonly string[]): string {
  const specs = (args.find((argument) => argument.startsWith(TOOL_PROPERTY)) ?? '')
    .slice(TOOL_PROPERTY.length)
    .split(',');
  return specs
    .map(
      (spec) => `${MARKER}\t${String(spec.split('=')[0])}\t/fake/${String(spec.split('=')[0])}.jar`,
    )
    .join('\n');
}

function mavenClasspaths(args: readonly string[]): void {
  const pom = textOf(args[args.indexOf('--file') + 1]);
  const directory = path.dirname(pom);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const moduleDirectory = containedPath(directory, entry.name);
    if (entry.isDirectory() && existsSync(path.join(moduleDirectory, 'pom.xml'))) {
      writeFileSync(path.join(moduleDirectory, 'classpath.txt'), pom);
    }
  }
}

function workspaceOf(directory: string): string {
  const chain = [directory];
  for (const current of chain) {
    if (path.basename(current).startsWith('nitpicker-fix-')) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent !== current) {
      chain.push(parent);
    }
  }
  return directory;
}

function parseError(operation: string, file: string): string {
  return operation === 'ktlint-fix'
    ? `${file}:1:1: Not a valid Kotlin file (1:1 expecting a name) ()`
    : `${file}:1:1: error: expecting a name`;
}

function launched(invocation: Invocation): Launch {
  const tokens = parseArgumentFile(textOf(invocation.args[0]).slice(1));
  const classpathIndex = tokens.indexOf('-cp');
  return {
    jvmArgs: tokens.slice(0, classpathIndex),
    classpath: tokens[classpathIndex + 1],
    mainClass: tokens[classpathIndex + 2],
    args: tokens.slice(classpathIndex + CLASS_ARGUMENTS_OFFSET),
  };
}

export function fakeJvmTools({
  transform = squeezed,
  failure = {},
  unparsable = 'BROKEN',
}: FakeOptions = {}): FakeJvmTools {
  const calls: Invocation[] = [];
  const launches: (Launch & Record<string, unknown>)[] = [];
  function format(invocation: Invocation): CommandResult {
    const launch = launched(invocation);
    const defaults = launch.args.find((argument) => argument.startsWith(DEFAULTS_OPTION));
    launches.push({
      operation: invocation.operation,
      cwd: invocation.cwd,
      ...launch,
      layout: readdirSync(workspaceOf(invocation.cwd), { recursive: true }).sort(byText),
      defaults:
        defaults === undefined
          ? undefined
          : readFileSync(defaults.slice(DEFAULTS_OPTION.length), 'utf8'),
    });
    const failed = [];
    for (const file of launch.args.filter((argument) => /\.kts?$|\.java$/u.test(argument))) {
      const target = containedPath(invocation.cwd, file);
      const content = readFileSync(target, 'utf8');
      if (content.includes(unparsable)) {
        failed.push(parseError(invocation.operation, file));
      } else {
        writeFileSync(target, transform(content, file));
      }
    }
    return { status: failed.length > 0 ? 1 : 0, stdout: '', stderr: failed.join('\n') };
  }
  function executeFixCommand(invocation: Invocation): CommandResult {
    if (invocation.operation === 'java-probe') {
      return { status: 0, stdout: '', stderr: 'openjdk version "21.0.1"' };
    }
    calls.push(invocation);
    const failed = failure[invocation.operation];
    if (failed !== undefined) {
      return failed;
    }
    if (invocation.operation !== 'fix-tools') {
      return format(invocation);
    }
    if (invocation.args.includes('--file')) {
      mavenClasspaths(invocation.args);
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 0, stdout: `${gradleClasspaths(invocation.args)}\n`, stderr: '' };
  }
  return {
    executeFixCommand,
    calls,
    launches,
    operations: () => calls.map(({ operation }) => operation),
  };
}
