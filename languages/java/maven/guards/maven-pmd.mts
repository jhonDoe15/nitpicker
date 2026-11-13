import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

type CpdOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };

const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_SKIPPED = 'cpd-skipped.txt';

export { runPmd } from '../maven-lint.mjs';

function launchCpd(options: CpdOptions, command: unknown): unknown {
  try {
    return callUntyped(runJava, {
      tool: 'PMD CPD',
      classpath: fieldOf(options['tools'], 'pmd'),
      mainClass: fieldOf(command, 'launcher'),
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

export function runCpd(options: CpdOptions): void {
  const { reportDir } = options;
  const module = mavenModuleOf(options['module']);
  const report = path.join(reportDir, CPD_REPORT);
  const failure = path.join(reportDir, CPD_FAILURE);
  for (const stale of [report, failure, path.join(reportDir, CPD_SKIPPED)]) {
    rmSync(stale, { force: true });
  }
  const directories = [
    ...textsOf(module['sourceRoots']),
    ...textsOf(module['testSourceRoots']),
  ].filter((root) => existsSync(root));
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
