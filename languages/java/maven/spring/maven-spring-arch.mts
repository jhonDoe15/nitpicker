import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaCommand, runJava } from '../maven-command.mjs';
import { cacheDirectory, publishDirectory } from '../maven-tools.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type ArchOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };
type JavaRun = { readonly spawn: unknown; readonly timeoutMs: unknown };
type RuleBuild = JavaRun & {
  readonly classes: string;
  readonly sources: readonly string[];
  readonly libraries: readonly string[];
  readonly cwd: unknown;
};
type RuleRun = JavaRun & {
  readonly module: unknown;
  readonly classpaths: unknown;
  readonly libraries: readonly string[];
  readonly springRoles: unknown;
  readonly locations: { readonly classes: string; readonly output: string };
};

const ARCHUNIT = 'archunit';
const RULES_DIRECTORY = path.join(GRADLE_DIRECTORY, ARCHUNIT);
const TOOL = 'Spring architecture rules';
const PROPERTY_SEPARATOR = ' = ';
const ROLES_PROPERTY = 'nitpicker.spring.roles';

function identityLines(spawn: unknown): string[] {
  const result = callUntyped(
    spawn,
    javaCommand('java'),
    ['-XshowSettings:properties', '-version'],
    {
      encoding: 'utf8',
    },
  );
  const error = fieldOf(result, 'error');
  if (error !== undefined || fieldOf(result, 'status') !== 0) {
    const reason = error === undefined ? fieldOf(result, 'stderr') : fieldOf(error, 'message');
    throw new Error(`${TOOL} need the JDK identity, but java -version failed: ${textOf(reason)}`);
  }
  const output = `${textOf(fieldOf(result, 'stderr'))}\n${textOf(fieldOf(result, 'stdout'))}`;
  return output.split(/\r?\n/u).map((line) => line.trim());
}

function jdkIdentity(spawn: unknown): string {
  const lines = identityLines(spawn);
  function property(name: string): string {
    const line = lines.find((candidate) => candidate.startsWith(`${name}${PROPERTY_SEPARATOR}`));
    if (line === undefined) {
      throw new Error(`${TOOL} need the JDK identity, but java reported no ${name}`);
    }
    return line.slice(name.length + PROPERTY_SEPARATOR.length);
  }
  return `${property('java.vendor')}|${property('java.version')}`;
}

function ruleSources(rulesDirectory: string): string[] {
  return readdirSync(rulesDirectory, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(rulesDirectory, name))
    .sort();
}

function cacheKey(sources: readonly string[], versions: string, spawn: unknown): string {
  const digest = createHash('sha256');
  for (const source of sources) {
    digest.update(readFileSync(source));
  }
  digest.update(`${versions}|${jdkIdentity(spawn)}`);
  return digest.digest('hex');
}

function accepted(result: unknown): boolean {
  return fieldOf(result, 'status') === 0;
}

function compileRules({ classes, sources, libraries, cwd, spawn, timeoutMs }: RuleBuild): void {
  if (existsSync(classes)) {
    return;
  }
  const staging = `${classes}.${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    callUntyped(runJava, {
      tool: TOOL,
      java: textOf(javaCommand('javac')),
      jvmArgs: ['-proc:none', '-nowarn', '-d', staging],
      classpath: libraries,
      args: sources,
      cwd,
      spawn,
      timeoutMs,
      accept: accepted,
    });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  publishDirectory(staging, classes);
}

function existing(entries: readonly string[]): string[] {
  return entries.filter((entry) => existsSync(entry));
}

function runRules({
  module,
  classpaths,
  libraries,
  locations,
  springRoles,
  ...run
}: RuleRun): void {
  const outputDirectory = textOf(fieldOf(module, 'outputDirectory'));
  const testOutputDirectory = textOf(fieldOf(module, 'testOutputDirectory'));
  const projectPath = [
    outputDirectory,
    testOutputDirectory,
    ...textsOf(fieldOf(classpaths, 'mainCompile')),
    ...textsOf(fieldOf(classpaths, 'testCompile')),
  ];
  callUntyped(runJava, {
    tool: TOOL,
    classpath: [...new Set([locations.classes, ...libraries, ...existing(projectPath)])],
    jvmArgs: springRoles === undefined ? [] : [`-D${ROLES_PROPERTY}=${textOf(springRoles)}`],
    mainClass: 'ArchRules',
    args: [locations.output, outputDirectory, testOutputDirectory],
    cwd: fieldOf(module, 'basedir'),
    ...run,
    accept: accepted,
  });
}

function cachedClasses(sources: readonly string[], pinned: unknown, spawn: unknown): string {
  const root = textOf(cacheDirectory('spring-arch'));
  mkdirSync(root, { recursive: true });
  const versions = `${textOf(fieldOf(pinned, ARCHUNIT))}|${textOf(fieldOf(pinned, 'asm'))}`;
  return path.join(root, cacheKey(sources, versions, spawn));
}

export function runSpringArch(options: ArchOptions): void {
  const { module, tools, classpaths, pinned, springRoles, timeoutMs } = options;
  if (options['archRules'] !== true) {
    return;
  }
  const spawn = options['spawn'] ?? spawnSync;
  const output = path.join(options.reportDir, 'spring-arch.json');
  rmSync(output, { force: true });
  const rules = options['rules'];
  const sources = ruleSources(rules === undefined ? RULES_DIRECTORY : textOf(rules));
  const classes = cachedClasses(sources, pinned, spawn);
  const libraries = existing(textsOf(fieldOf(tools, ARCHUNIT)));
  const cwd = fieldOf(module, 'basedir');
  compileRules({ classes, sources, libraries, cwd, spawn, timeoutMs });
  runRules({
    module,
    classpaths,
    libraries,
    springRoles,
    locations: { classes, output },
    spawn,
    timeoutMs,
  });
}
