import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../tooling/tool-resolution.mjs';
import { isGitWorkTree, memberProjectOf } from '../plan/member-root.mjs';
import { enclosingMember } from '../plan/enclosing.mjs';
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
    return { plan: isGitWorkTree(root) ? planMonorepo({ root }) : undefined, root };
  } catch (error) {
    return { plan: undefined, error };
  }
}

function enclosingScope(cli, root) {
  const enclosing = root === undefined ? undefined : memberAround(root);
  return enclosing?.member === undefined
    ? { currentProjectRoot: cli.currentProjectRoot }
    : { currentProjectRoot: enclosing.member.absolute, configOverlay: enclosing.member.overlay };
}

function memberAround(root) {
  try {
    return isGitWorkTree(root) ? enclosingMember(root) : undefined;
  } catch (error) {
    return { member: undefined, error };
  }
}

export function oneProjectScope(cli, command) {
  if (cli.arguments_.includes('--help')) {
    return { currentProjectRoot: cli.currentProjectRoot };
  }
  const { plan, root } = monorepoAt(cli);
  if (plan === undefined) {
    return enclosingScope(cli, root);
  }
  const member =
    cli.currentProjectRoot === undefined ? memberProjectOf(plan, cli.workingDirectory) : undefined;
  if (member !== undefined) {
    return { currentProjectRoot: member.absolute, configOverlay: member.overlay };
  }
  cli.stderr.write(oneProjectCommandMessage(plan, command));
  return { exitCode: 2 };
}
