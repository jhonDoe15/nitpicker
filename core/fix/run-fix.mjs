import { spawnSyncWithOutputFile } from '../tooling/output-file/output-file.mjs';
import { TOOL_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { fixTypeScript } from '../../languages/typescript/fix/typescript-fix.mjs';
import { dryRun } from './dry-run/dry-run.mjs';
import { createJournal, journalWriter } from './dry-run/journal.mjs';
import { directWriter } from './engine/writer.mjs';
import { languageFixers } from './language-fixers.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function spawnEnvironment(baseEnvironment, overrides = {}) {
  if (baseEnvironment === undefined && Object.keys(overrides).length === 0) {
    return undefined;
  }
  return { ...baseEnvironment, ...overrides };
}

export function spawnInvocation(
  { command, args, cwd, input, environment, shell = false, timeout = TOOL_TIMEOUT_MS },
  baseEnvironment,
  spawn = spawnSyncWithOutputFile,
) {
  return spawn(command, args, {
    cwd,
    input,
    shell,
    timeout,
    env: spawnEnvironment(baseEnvironment, environment),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

function fixOnce(options) {
  const settings = {
    ...options,
    selectedRules: options.selectedRules ?? [],
    executeFixCommand: (invocation) =>
      options.executeFixCommand?.(invocation) ??
      spawnInvocation(invocation, options.spawnEnvironment),
  };
  const fixer = languageFixers[settings.config?.preset];
  return fixer === undefined ? fixTypeScript(settings) : fixer(settings);
}

export function fixWorkingTree(options) {
  const { repositoryRoot, projectRoot } = options;
  if (options.dryRun !== true) {
    return fixOnce({ ...options, writer: directWriter(projectRoot) });
  }
  const journal = createJournal(projectRoot);
  const { result, ...plan } = dryRun({
    repositoryRoot,
    journal,
    run: () => fixOnce({ ...options, writer: journalWriter(journal) }),
  });
  return { ...result, dryRun: plan };
}
