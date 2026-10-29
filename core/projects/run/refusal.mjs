import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../tooling/tool-resolution.mjs';
import { isGitWorkTree, memberProjectOf } from '../plan/member-root.mjs';
import { planMonorepo } from '../plan/inspect.mjs';
import { oneProjectCommandMessage } from './messages.mjs';

function rootOf(cli) {
  return cli.currentProjectRoot === undefined
    ? resolveProjectRoot(cli.workingDirectory)
    : realpathSync(cli.currentProjectRoot);
}

function monorepoAt(cli) {
  try {
    const root = rootOf(cli);
    return { plan: isGitWorkTree(root) ? planMonorepo({ root }) : undefined };
  } catch (error) {
    return { plan: undefined, error };
  }
}

export function oneProjectScope(cli, command) {
  if (cli.arguments_.includes('--help')) {
    return { currentProjectRoot: cli.currentProjectRoot };
  }
  const { plan } = monorepoAt(cli);
  if (plan === undefined) {
    return { currentProjectRoot: cli.currentProjectRoot };
  }
  const member =
    cli.currentProjectRoot === undefined ? memberProjectOf(plan, cli.workingDirectory) : undefined;
  if (member !== undefined) {
    return { currentProjectRoot: member.absolute, configOverlay: member.overlay };
  }
  cli.stderr.write(oneProjectCommandMessage(plan, command));
  return { exitCode: 2 };
}
