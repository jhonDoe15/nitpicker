import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaCommand } from '../maven-command.mjs';
import { cacheRoot } from '../maven-tools.mjs';

const RULES_DIRECTORY = path.join(GRADLE_DIRECTORY, 'archunit');
const RULES_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export function springArchCacheKey({ sources, archunit, jdk }) {
  const digest = createHash('sha256');
  for (const source of sources) {
    digest.update(source);
  }
  digest.update(`${archunit}|${jdk}`);
  return digest.digest('hex');
}

export function argumentFileText(entries) {
  const joined = [...new Set(entries.map((entry) => path.resolve(entry)))]
    .join(path.delimiter)
    .replaceAll('\\', '\\\\');
  return `-cp\n"${joined}"\n`;
}

export function archRulesArguments({ output, mainClasses, testClasses }) {
  return ['ArchRules', output, mainClasses.join(path.delimiter), testClasses.join(path.delimiter)];
}

export function javacArguments({ staging, argumentFile, sources }) {
  return ['-proc:none', '-nowarn', '-d', staging, `@${argumentFile}`, ...sources];
}

function execute({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: RULES_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Spring architecture rules failed: ${`${result.stdout}${result.stderr}`.trim()}`,
    );
  }
}

function jdkIdentity() {
  const result = spawnSync(javaCommand('java'), ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/u).map((line) => line.trim());
  function property(name) {
    return lines.find((line) => line.startsWith(`${name} = `))?.slice(name.length + 3) ?? '';
  }
  return `${property('java.vendor')}|${property('java.version')}`;
}

function ruleSources() {
  return readdirSync(RULES_DIRECTORY)
    .filter((name) => name.endsWith('.java'))
    .sort()
    .map((name) => path.join(RULES_DIRECTORY, name));
}

function publish(staging, classes) {
  try {
    renameSync(staging, classes);
  } catch (raced) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(classes)) {
      throw raced;
    }
  }
}

function compileRules({ classes, sources, libraries, directory }) {
  if (existsSync(classes)) {
    return;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  const argumentFile = path.join(directory, 'compile.args');
  writeFileSync(argumentFile, argumentFileText(libraries));
  try {
    execute({
      command: javaCommand('javac'),
      args: javacArguments({ staging, argumentFile, sources }),
      cwd: directory,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publish(staging, classes);
}

function rulesDirectory({ sources, archunit }) {
  const sourceBytes = sources.map((source) => readFileSync(source));
  const key = springArchCacheKey({ sources: sourceBytes, archunit, jdk: jdkIdentity() });
  const root = path.join(cacheRoot(), 'spring-arch');
  mkdirSync(root, { recursive: true });
  return path.join(root, key);
}

function existing(entries) {
  return entries.filter((entry) => existsSync(entry));
}

function freshDirectory(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function runRules({ module, classpaths, libraries, locations }) {
  const { classes, directory, output } = locations;
  const mainClasses = existing([module.outputDirectory]);
  const testClasses = existing([module.testOutputDirectory]);
  const projectPath = [
    ...mainClasses,
    ...testClasses,
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
  ];
  const argumentFile = path.join(directory, 'run.args');
  writeFileSync(argumentFile, argumentFileText([classes, ...libraries, ...existing(projectPath)]));
  execute({
    command: javaCommand('java'),
    args: [`@${argumentFile}`, ...archRulesArguments({ output, mainClasses, testClasses })],
    cwd: module.basedir,
  });
}

export function runSpringArch({ module, reportDir, tools, classpaths, pinned, spring }) {
  if (!spring) {
    return;
  }
  const output = path.join(reportDir, 'spring-arch.json');
  const directory = path.join(reportDir, 'spring-arch');
  rmSync(output, { force: true });
  freshDirectory(directory);
  const sources = ruleSources();
  const classes = rulesDirectory({ sources, archunit: pinned.archunit });
  const libraries = existing(tools.archunit);
  compileRules({ classes, sources, libraries, directory });
  runRules({ module, classpaths, libraries, locations: { classes, directory, output } });
}
