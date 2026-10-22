import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';

const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_SKIPPED = 'cpd-skipped.txt';

export { runPmd } from '../maven-lint.mjs';

function launchCpd({ module, tools, spawn }, command) {
  try {
    return runJava({
      tool: 'PMD CPD',
      classpath: tools.pmd,
      mainClass: command.launcher,
      args: command.args,
      cwd: module.basedir,
      spawn,
    });
  } catch (error) {
    return { signal: error.code ?? error.name, stderr: error.message };
  }
}

export function runCpd({ module, reportDir, tools, spawn }) {
  const report = path.join(reportDir, CPD_REPORT);
  const failure = path.join(reportDir, CPD_FAILURE);
  for (const stale of [report, failure, path.join(reportDir, CPD_SKIPPED)]) {
    rmSync(stale, { force: true });
  }
  const directories = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (directories.length === 0) {
    return;
  }
  const command = toolCommand('cpd', { report, directories });
  const result = launchCpd({ module, tools, spawn }, command);
  if (!command.accepts(result.status)) {
    rmSync(report, { force: true });
    writeFileSync(failure, `${String(result.status ?? result.signal)}\n${result.stderr}`);
  }
}
