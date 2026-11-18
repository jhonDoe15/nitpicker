import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { compiledProgram, programSources } from '../programs/helper-programs.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type ArchOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };
type JavaRun = { readonly spawn: unknown; readonly timeoutMs: unknown };
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
const ROLES_PROPERTY = 'nitpicker.spring.roles';

function accepted(result: unknown): boolean {
  return fieldOf(result, 'status') === 0;
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

export function runSpringArch(options: ArchOptions): void {
  const { module, tools, classpaths, pinned, springRoles, timeoutMs } = options;
  if (options['archRules'] !== true) {
    return;
  }
  const spawn = options['spawn'] ?? spawnSync;
  const output = path.join(options.reportDir, 'spring-arch.json');
  rmSync(output, { force: true });
  const rules = options['rules'];
  const libraries = existing(textsOf(fieldOf(tools, ARCHUNIT)));
  const classes = textOf(
    callUntyped(compiledProgram, {
      tool: TOOL,
      name: 'spring-arch',
      sources: programSources(rules === undefined ? RULES_DIRECTORY : textOf(rules), {
        recursive: true,
      }),
      version: `${textOf(fieldOf(pinned, ARCHUNIT))}|${textOf(fieldOf(pinned, 'asm'))}`,
      libraries,
      cwd: fieldOf(module, 'basedir'),
      spawn,
      timeoutMs,
    }),
  );
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
