import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../configuration/project-checks/project-root.mts';
import { isGitWorkTree, memberProjectOf as untypedMemberProjectOf } from '../plan/member-root.mjs';
import { enclosingMember } from '../plan/enclosing.mts';
import { planMonorepo } from '../plan/inspect.mts';
import { oneProjectCommandMessage as untypedCommandMessage } from './messages.mjs';
import type { Cli, ExitCode } from '../../cli-context.mts';
import type { MonorepoPlan, PlanProject } from '../project-types.mts';
import type { ProjectOverlay } from '../../../shared/values/config-types.mts';
import type { EnclosingMember } from '../plan/enclosing.mts';

type ScopeCli = Pick<Cli, 'arguments_' | 'stderr' | 'currentProjectRoot' | 'workingDirectory'>;

export type ProjectScope = {
  readonly currentProjectRoot: string | undefined;
  readonly configOverlay: ProjectOverlay | undefined;
};

type OneProjectScope = Partial<ProjectScope> & { readonly exitCode?: number };

type Monorepo = {
  readonly plan: MonorepoPlan | undefined;
  readonly root?: string;
  readonly error?: unknown;
};

const memberProjectOf: (
  plan: MonorepoPlan,
  workingDirectory: string | undefined,
) => PlanProject | undefined = untypedMemberProjectOf;
const oneProjectCommandMessage: (plan: MonorepoPlan, command: string) => string =
  untypedCommandMessage;

function rootOf(cli: ScopeCli): string {
  return cli.currentProjectRoot === undefined
    ? resolveProjectRoot(cli.workingDirectory)
    : realpathSync(cli.currentProjectRoot);
}

function monorepoAt(cli: ScopeCli): Monorepo {
  try {
    const root = rootOf(cli);
    return { plan: isGitWorkTree(root) ? planMonorepo({ root }) : undefined, root };
  } catch (error) {
    return { plan: undefined, error };
  }
}

function enclosingScope(cli: ScopeCli, root: string | undefined): OneProjectScope {
  const enclosing = root === undefined ? undefined : memberAround(root);
  return enclosing?.member === undefined
    ? { currentProjectRoot: cli.currentProjectRoot }
    : { currentProjectRoot: enclosing.member.absolute, configOverlay: enclosing.member.overlay };
}

function memberAround(
  root: string,
): EnclosingMember | { readonly member: undefined; readonly error: unknown } | undefined {
  try {
    return isGitWorkTree(root) ? enclosingMember(root) : undefined;
  } catch (error) {
    return { member: undefined, error };
  }
}

export function oneProjectScope(cli: ScopeCli, command: string): OneProjectScope {
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

export function runScoped(
  cli: ScopeCli,
  command: string,
  run: (scope: ProjectScope) => ExitCode,
): ExitCode {
  const scope = oneProjectScope(cli, command);
  return (
    scope.exitCode ??
    run({ currentProjectRoot: scope.currentProjectRoot, configOverlay: scope.configOverlay })
  );
}
