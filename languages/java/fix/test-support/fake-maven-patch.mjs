import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OK = { status: 0, stdout: '', stderr: '' };
const CHECKS_ARGUMENT_COUNT = 3;
const REPORT_SCRIPT = /ErrorProneReport\.java$/u;

function pomFor(root) {
  return `<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>jobs</artifactId><version>1</version><packaging>jar</packaging><build><directory>${root}/target</directory><outputDirectory>${root}/target/classes</outputDirectory><testOutputDirectory>${root}/target/test-classes</testOutputDirectory><sourceDirectory>${root}/src/main/java</sourceDirectory><testSourceDirectory>${root}/src/test/java</testSourceDirectory></build></project>`;
}

function optionOf(args, prefix) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function tokensOf(file) {
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

function errorProneRun(invocation, patch) {
  const tokens = tokensOf(invocation.args[0].slice(1));
  const at = tokens.findIndex((token) => REPORT_SCRIPT.test(token));
  const report = tokens[at + 1];
  const flags = tokens
    .slice(at + CHECKS_ARGUMENT_COUNT)
    .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
    .filter((line) => line.startsWith('--errorprone-flag='))
    .map((line) => line.slice('--errorprone-flag='.length));
  const location = flags
    .find((flag) => flag.startsWith('-XepPatchLocation:'))
    .slice('-XepPatchLocation:'.length);
  const checks = flags
    .find((flag) => flag.startsWith('-XepPatchChecks:'))
    .slice('-XepPatchChecks:'.length)
    .split(',');
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

export function mavenPatchResponse(invocation, { patch, mavenClasspaths }) {
  const { args, cwd } = invocation;
  const output = optionOf(args, '-Doutput=');
  if (output !== undefined) {
    writeFileSync(output, pomFor(cwd));
    return OK;
  }
  if (args.includes('test-compile')) {
    const target = optionOf(args, '-DoutputFile=')
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
  return errorProneRun(invocation, patch);
}
