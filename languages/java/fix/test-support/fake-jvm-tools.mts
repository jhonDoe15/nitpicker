import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath as untypedContainedPath } from '../../../../core/fix/common/contained-path.mjs';
import { byText as untypedByText } from '../../../../shared/text-order/by-text.mjs';
import { parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { mavenPatchResponse, optionOf, requiredOption, tokensOf } from './fake-maven-patch.mts';
import type { FakeInvocation, PatchHooks, Reply } from './fake-maven-patch.mts';

const containedPath: (root: string, name: string) => string = untypedContainedPath;
const byText: (left: string, right: string) => number = untypedByText;

const MARKER = 'nitpicker-fix-tool';
const SETTINGS_PROPERTY = '-Pnitpicker.errorprone.settings=';
const TOOL_PROPERTY = '-Pnitpicker.fix.tools=';
const DEFAULTS_OPTION = '--editorconfig=';
const CLASS_ARGUMENTS_OFFSET = 3;
const OK: Reply = { status: 0, stdout: '', stderr: '' };

type Launch = {
  readonly jvmArgs: string[];
  readonly classpath: string;
  readonly mainClass: string;
  readonly args: string[];
};

type RecordedLaunch = Launch & {
  readonly operation: string | undefined;
  readonly cwd: string;
  readonly layout: string[];
  readonly defaults: string | undefined;
};

export type PatchCall = FakeInvocation & { readonly flags: string[] };

type Patch = {
  readonly gradle?: (invocation: FakeInvocation) => Reply;
  readonly maven?: PatchHooks;
};

type Options = {
  readonly transform?: (source: string, file: string) => string;
  readonly failure?: Readonly<Record<string, Reply>> | undefined;
  readonly unparsable?: string;
  readonly patch?: Patch | undefined;
};

export type FakeJvmTools = {
  readonly executeFixCommand: (invocation: FakeInvocation) => Reply;
  readonly calls: FakeInvocation[];
  readonly patchCalls: PatchCall[];
  readonly launches: RecordedLaunch[];
  readonly operations: () => (string | undefined)[];
};

function recordedFlags(invocation: FakeInvocation): string[] {
  const file = optionOf(invocation.args, SETTINGS_PROPERTY);
  return file === undefined ? [] : textsOf(parseJson(readFileSync(file, 'utf8')));
}

function squeezed(source: string): string {
  return source.replaceAll(/ {2,}/g, ' ');
}

function gradleClasspaths(args: readonly string[]): string {
  const specs = requiredOption(args, TOOL_PROPERTY).split(',');
  return specs
    .map((spec) => `${MARKER}\t${spec.split('=')[0] ?? ''}\t/fake/${spec.split('=')[0] ?? ''}.jar`)
    .join('\n');
}

function mavenClasspaths(args: readonly string[]): void {
  const pom = args[args.indexOf('--file') + 1] ?? '';
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

function parseError(operation: string | undefined, file: string): string {
  return operation === 'ktlint-fix'
    ? `${file}:1:1: Not a valid Kotlin file (1:1 expecting a name) ()`
    : `${file}:1:1: error: expecting a name`;
}

function launched(invocation: FakeInvocation): Launch {
  const tokens = tokensOf((invocation.args[0] ?? '').slice(1));
  const classpathIndex = tokens.indexOf('-cp');
  return {
    jvmArgs: tokens.slice(0, classpathIndex),
    classpath: tokens[classpathIndex + 1] ?? '',
    mainClass: tokens[classpathIndex + 2] ?? '',
    args: tokens.slice(classpathIndex + CLASS_ARGUMENTS_OFFSET),
  };
}

function recordLaunch(invocation: FakeInvocation, launch: Launch): RecordedLaunch {
  const defaults = optionOf(launch.args, DEFAULTS_OPTION);
  return {
    operation: invocation.operation,
    cwd: invocation.cwd,
    ...launch,
    layout: readdirSync(workspaceOf(invocation.cwd), { recursive: true, encoding: 'utf8' }).sort(
      byText,
    ),
    defaults: defaults === undefined ? undefined : readFileSync(defaults, 'utf8'),
  };
}

function formatResponse(invocation: FakeInvocation, options: Options): Reply {
  const { transform = squeezed, unparsable = 'BROKEN' } = options;
  const failed: string[] = [];
  for (const file of launched(invocation).args.filter((argument) =>
    /\.kts?$|\.java$/u.test(argument),
  )) {
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

function patchResponse(invocation: FakeInvocation, patch: Patch | undefined): Reply {
  const gradle = invocation.args.some((argument) => argument.startsWith(SETTINGS_PROPERTY));
  return gradle
    ? (patch?.gradle?.(invocation) ?? OK)
    : mavenPatchResponse(invocation, { patch: patch?.maven, mavenClasspaths });
}

export function fakeJvmTools(options: Options = {}): FakeJvmTools {
  const { failure = {}, patch } = options;
  const calls: FakeInvocation[] = [];
  const patchCalls: PatchCall[] = [];
  const launches: RecordedLaunch[] = [];

  function format(invocation: FakeInvocation): Reply {
    launches.push(recordLaunch(invocation, launched(invocation)));
    return formatResponse(invocation, options);
  }

  function executeFixCommand(invocation: FakeInvocation): Reply {
    const { operation = '' } = invocation;
    if (operation === 'java-probe') {
      return { status: 0, stdout: '', stderr: 'openjdk version "21.0.1"' };
    }
    if (operation === 'error-prone-patch') {
      patchCalls.push({ ...invocation, flags: recordedFlags(invocation) });
      return failure[operation] ?? patchResponse(invocation, patch);
    }
    calls.push(invocation);
    if (failure[operation] !== undefined) {
      return failure[operation];
    }
    if (operation !== 'fix-tools') {
      return format(invocation);
    }
    if (invocation.args.includes('--file')) {
      mavenClasspaths(invocation.args);
      return OK;
    }
    return { status: 0, stdout: `${gradleClasspaths(invocation.args)}\n`, stderr: '' };
  }

  return {
    executeFixCommand,
    calls,
    patchCalls,
    launches,
    operations: () => calls.map(({ operation }) => operation),
  };
}
