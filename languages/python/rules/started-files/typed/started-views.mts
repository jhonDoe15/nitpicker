import { readTextIfExists as untypedRead } from '../../../../../shared/filesystem.mts';
import { shellCommands as untypedShell } from '../../../../../shared/started-files/shell-commands.mts';
import { workflowCommands as untypedWorkflow } from '../../../../../shared/started-files/workflow-commands.mts';
import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mts';

export type ShellSegment = { readonly tokens: readonly string[]; readonly directory: string };
export type WorkflowCommand = { readonly command: string; readonly directory: string };
export type CommandNode = { readonly value: unknown; readonly key: string };

export const readTextIfExists: (file: string) => string = untypedRead;
export const shellCommands: (command: string, baseDirectory?: string) => ShellSegment[] =
  untypedShell;
export const workflowCommands: (text: string) => WorkflowCommand[] = untypedWorkflow;
export const depthFirst: (
  root: CommandNode,
  children: (node: CommandNode) => CommandNode[],
) => Iterable<CommandNode> = untypedDepthFirst;
