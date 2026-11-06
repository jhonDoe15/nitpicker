import { fixWorkingTree } from '../fix/run-fix.mjs';

export function fixIfRequested(cli, repositoryRoot, base) {
  if (!cli.options.fix) {
    return { fixedFiles: [], toolErrors: [] };
  }
  const fixResult = fixWorkingTree({
    repositoryRoot,
    projectRoot: cli.currentProjectRoot,
    baseRef: base.baseRef,
    executeFixCommand: cli.executeFixCommand,
    headPolicy: cli.headPolicy,
    config: cli.config,
    environment: cli.environment,
    spawnEnvironment: cli.spawnEnvironment,
  });
  cli.stdout.write(
    `Fixed files:\n${fixResult.fixedFiles.length === 0 ? '(none)\n' : `${fixResult.fixedFiles.join('\n')}\n`}`,
  );
  if (fixResult.notes?.length > 0) {
    cli.stdout.write(`Fix notes:\n${fixResult.notes.map((note) => `  ${note}\n`).join('')}`);
  }
  return fixResult;
}
