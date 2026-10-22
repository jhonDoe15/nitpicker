import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaCommand, runJava } from '../maven-command.mjs';
import { cacheDirectory } from '../maven-tools.mjs';

const RULES_DIRECTORY = path.join(GRADLE_DIRECTORY, 'archunit');
const TOOL = 'Spring architecture rules';
const PROPERTY_SEPARATOR = ' = ';

function jdkIdentity() {
  const result = spawnSync(javaCommand('java'), ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${TOOL} need the JDK identity, but java -version failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/u).map((line) => line.trim());
  function property(name) {
    const line = lines.find((candidate) => candidate.startsWith(`${name}${PROPERTY_SEPARATOR}`));
    if (line === undefined) {
      throw new Error(`${TOOL} need the JDK identity, but java reported no ${name}`);
    }
    return line.slice(name.length + PROPERTY_SEPARATOR.length);
  }
  return `${property('java.vendor')}|${property('java.version')}`;
}

function ruleSources(rulesDirectory) {
  return readdirSync(rulesDirectory)
    .filter((name) => name.endsWith('.java'))
    .sort()
    .map((name) => path.join(rulesDirectory, name));
}

function cacheKey({ sources, archunit }) {
  const digest = createHash('sha256');
  for (const source of sources) {
    digest.update(readFileSync(source));
  }
  digest.update(`${archunit}|${jdkIdentity()}`);
  return digest.digest('hex');
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

function compileRules({ classes, sources, libraries, cwd }) {
  if (existsSync(classes)) {
    return;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    runJava({
      tool: TOOL,
      java: javaCommand('javac'),
      jvmArgs: ['-proc:none', '-nowarn', '-d', staging],
      classpath: libraries,
      args: sources,
      cwd,
      accept: (result) => result.status === 0,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publish(staging, classes);
}

function existing(entries) {
  return entries.filter((entry) => existsSync(entry));
}

function runRules({ module, classpaths, libraries, locations }) {
  const { classes, output } = locations;
  const projectPath = [
    module.outputDirectory,
    module.testOutputDirectory,
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
  ];
  runJava({
    tool: TOOL,
    classpath: [...new Set([classes, ...libraries, ...existing(projectPath)])],
    mainClass: 'ArchRules',
    args: [output, module.outputDirectory, module.testOutputDirectory],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
  });
}

export function runSpringArch(options) {
  const { module, reportDir, tools, classpaths, pinned, spring } = options;
  if (!spring) {
    return;
  }
  const output = path.join(reportDir, 'spring-arch.json');
  rmSync(output, { force: true });
  const sources = ruleSources(options.rules ?? RULES_DIRECTORY);
  const root = cacheDirectory('spring-arch');
  mkdirSync(root, { recursive: true });
  const classes = path.join(root, cacheKey({ sources, archunit: pinned.archunit }));
  const libraries = existing(tools.archunit);
  compileRules({ classes, sources, libraries, cwd: module.basedir });
  runRules({ module, classpaths, libraries, locations: { classes, output } });
}
