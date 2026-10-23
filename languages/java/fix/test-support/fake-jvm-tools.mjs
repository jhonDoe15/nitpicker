import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';

const MARKER = 'nitpicker-fix-tool';
const TOOL_PROPERTY = '-Pnitpicker.fix.tools=';
const DEFAULTS_OPTION = '--editorconfig=';
const CLASS_ARGUMENTS_OFFSET = 3;

function squeezed(source) {
  return source.replaceAll(/ {2,}/g, ' ');
}

function parseArgumentFile(file) {
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

function gradleClasspaths(args) {
  const specs = args
    .find((argument) => argument.startsWith(TOOL_PROPERTY))
    .slice(TOOL_PROPERTY.length)
    .split(',');
  return specs
    .map((spec) => `${MARKER}\t${spec.split('=')[0]}\t/fake/${spec.split('=')[0]}.jar`)
    .join('\n');
}

function mavenClasspaths(args) {
  const pom = args[args.indexOf('--file') + 1];
  const directory = path.dirname(pom);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const moduleDirectory = containedPath(directory, entry.name);
    if (entry.isDirectory() && existsSync(path.join(moduleDirectory, 'pom.xml'))) {
      writeFileSync(path.join(moduleDirectory, 'classpath.txt'), pom);
    }
  }
}

function workspaceOf(directory) {
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

function launched(invocation) {
  const tokens = parseArgumentFile(invocation.args[0].slice(1));
  const classpathIndex = tokens.indexOf('-cp');
  return {
    jvmArgs: tokens.slice(0, classpathIndex),
    classpath: tokens[classpathIndex + 1],
    mainClass: tokens[classpathIndex + 2],
    args: tokens.slice(classpathIndex + CLASS_ARGUMENTS_OFFSET),
  };
}

export function fakeJvmTools({ transform = squeezed, failure = {}, unparsable = 'BROKEN' } = {}) {
  const calls = [];
  const launches = [];
  function format(invocation) {
    const launch = launched(invocation);
    const defaults = launch.args.find((argument) => argument.startsWith(DEFAULTS_OPTION));
    launches.push({
      operation: invocation.operation,
      cwd: invocation.cwd,
      ...launch,
      layout: readdirSync(workspaceOf(invocation.cwd), { recursive: true }).sort(),
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
        failed.push(`Error formatting ${file}: ${target}:1:1: error: unparsable`);
      } else {
        writeFileSync(target, transform(content, file));
      }
    }
    return { status: failed.length > 0 ? 1 : 0, stdout: '', stderr: failed.join('\n') };
  }
  function executeFixCommand(invocation) {
    calls.push(invocation);
    if (failure[invocation.operation] !== undefined) {
      return failure[invocation.operation];
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
