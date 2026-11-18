import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FixInvocation } from '../../../../core/fix/typed/fix-types.mts';

export type Reply = { readonly status: number; readonly stdout: string; readonly stderr: string };

export type FakeInvocation = FixInvocation & { readonly operation?: string | undefined };

type Diagnostic = { readonly file: string; readonly line: number; readonly message: string };

export type PatchHooks = {
  readonly patch: (cwd: string, directory: string, checks: readonly string[]) => string;
  readonly diagnostics: (cwd: string) => readonly Diagnostic[];
};

type MavenOptions = {
  readonly patch: PatchHooks | undefined;
  readonly mavenClasspaths: (args: readonly string[]) => void;
};

const OK: Reply = { status: 0, stdout: '', stderr: '' };
const CHECKS_ARGUMENT_COUNT = 3;
const REPORT_PROGRAM = 'ErrorProneReport';

function pomFor(root: string): string {
  const build = [
    `<directory>${root}/target</directory>`,
    `<outputDirectory>${root}/target/classes</outputDirectory>`,
    `<testOutputDirectory>${root}/target/test-classes</testOutputDirectory>`,
    `<sourceDirectory>${root}/src/main/java</sourceDirectory>`,
    `<testSourceDirectory>${root}/src/test/java</testSourceDirectory>`,
  ].join('');
  return [
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId>',
    '<artifactId>jobs</artifactId><version>1</version><packaging>jar</packaging>',
    `<build>${build}</build></project>`,
  ].join('');
}

export function optionOf(args: readonly string[], prefix: string): string | undefined {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

export function tokensOf(file: string): string[] {
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

export function requiredOption(args: readonly string[], prefix: string): string {
  const value = optionOf(args, prefix);
  if (value === undefined) {
    throw new Error(`missing ${prefix}`);
  }
  return value;
}

function errorProneRun(invocation: FakeInvocation, patch: PatchHooks | undefined): Reply {
  const tokens = tokensOf((invocation.args[0] ?? '').slice(1));
  const at = tokens.indexOf(REPORT_PROGRAM);
  if (at < 0) {
    return OK;
  }
  const report = tokens[at + 1] ?? '';
  const flags = tokens
    .slice(at + CHECKS_ARGUMENT_COUNT)
    .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
    .filter((line) => line.startsWith('--errorprone-flag='))
    .map((line) => line.slice('--errorprone-flag='.length));
  const location = requiredOption(flags, '-XepPatchLocation:');
  const checks = requiredOption(flags, '-XepPatchChecks:').split(',');
  const directory = path.join(location, 'abc123');
  if (patch !== undefined) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'error-prone.patch'),
      patch.patch(invocation.cwd, directory, checks),
    );
  }
  const found = patch?.diagnostics(invocation.cwd) ?? [];
  writeFileSync(
    report,
    JSON.stringify(
      found.filter(({ message }) => checks.some((check) => message.startsWith(`[${check}]`))),
    ),
  );
  return OK;
}

export function mavenPatchResponse(
  invocation: FakeInvocation,
  { patch, mavenClasspaths }: MavenOptions,
): Reply {
  const { args, cwd } = invocation;
  const output = optionOf(args, '-Doutput=');
  if (output !== undefined) {
    writeFileSync(output, pomFor(cwd));
    return OK;
  }
  if (args.includes('test-compile')) {
    const target = requiredOption(args, '-DoutputFile=')
      .replace(/\$\{project\.groupId\}/u, 'demo')
      .replace(/\$\{project\.artifactId\}/u, 'jobs');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '\n');
    return OK;
  }
  if (args.includes('--file')) {
    mavenClasspaths(args);
    return OK;
  }
  if (args[0] === '-version') {
    return { status: 0, stdout: '', stderr: 'openjdk version "21.0.1"' };
  }
  if (args[0] === '-XshowSettings:properties') {
    return { status: 0, stdout: '', stderr: '    java.vendor = Fake\n    java.version = 21.0.1\n' };
  }
  return errorProneRun(invocation, patch);
}
