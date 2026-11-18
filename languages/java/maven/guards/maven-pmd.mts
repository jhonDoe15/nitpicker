import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../programs/java-command.mts';
import { compiledProgram } from '../programs/helper-programs.mts';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { handWrittenRoots } from '../generated/generated-roots.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

type CpdOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };

const CPD_TOOL = 'PMD CPD';
const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_SKIPPED = 'cpd-skipped.txt';

export { runPmd } from '../maven-lint.mts';

function cpdLauncher(options: CpdOptions, command: unknown): unknown {
  const launcher = textOf(fieldOf(command, 'launcher'));
  if (!launcher.endsWith('.java')) {
    return { classpath: fieldOf(options['tools'], 'pmd'), mainClass: launcher };
  }
  const libraries = textsOf(fieldOf(options['tools'], 'pmd'));
  const classes = callUntyped(compiledProgram, {
    tool: CPD_TOOL,
    name: 'cpd-report',
    sources: [launcher],
    version: textOf(fieldOf(options['pinned'], 'pmd')),
    libraries,
    cwd: fieldOf(options['module'], 'basedir'),
    spawn: options['spawn'],
  });
  return {
    classpath: [textOf(classes), ...libraries],
    mainClass: path.basename(launcher, '.java'),
  };
}

function launchCpd(options: CpdOptions, command: unknown): unknown {
  try {
    return callUntyped(runJava, {
      tool: CPD_TOOL,
      ...fieldsOf(cpdLauncher(options, command)),
      args: fieldOf(command, 'args'),
      cwd: fieldOf(options['module'], 'basedir'),
      spawn: options['spawn'],
    });
  } catch (error) {
    return {
      signal: fieldOf(error, 'code') ?? fieldOf(error, 'name'),
      stderr: fieldOf(error, 'message'),
    };
  }
}

function removeStale(files: readonly string[]): void {
  for (const stale of files) {
    rmSync(stale, { force: true });
  }
}

export function runCpd(options: CpdOptions): void {
  const { reportDir } = options;
  const module = mavenModuleOf(options['module']);
  const report = path.join(reportDir, CPD_REPORT);
  const failure = path.join(reportDir, CPD_FAILURE);
  removeStale([report, failure, path.join(reportDir, CPD_SKIPPED)]);
  const directories = handWrittenRoots(
    module,
    [...textsOf(module['sourceRoots']), ...textsOf(module['testSourceRoots'])],
    options['configs'],
  ).filter((root) => existsSync(root));
  if (directories.length === 0) {
    return;
  }
  const command = callUntyped(toolCommand, 'cpd', { report, directories });
  const result = launchCpd(options, command);
  const status = fieldOf(result, 'status');
  if (callUntyped(fieldOf(command, 'accepts'), status) !== true) {
    rmSync(report, { force: true });
    const outcome = status ?? fieldOf(result, 'signal');
    writeFileSync(failure, `${textOf(outcome)}\n${textOf(fieldOf(result, 'stderr'))}`);
  }
}
