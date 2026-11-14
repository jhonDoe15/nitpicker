import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process';
import { linkPolicyFile as linkUntypedPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import {
  trackTemporaryPath as trackUntypedTemporaryPath,
  untrackTemporaryPath as untrackUntypedTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { spawnSyncWithOutputFile as spawnUntypedWithOutputFile } from '../../../../core/tooling/output-file/output-file.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import {
  isToolInstalled as untypedIsToolInstalled,
  resolveTool as resolveUntypedTool,
  toolNameForPath as untypedToolNameForPath,
} from '../../../../core/tooling/tool-resolution.mjs';

type ToolLocation = {
  readonly projectRoot?: string;
  readonly bin?: string;
  readonly packageRoot?: string;
};

type ResolvedTool = { readonly root: string; readonly binPath: string | undefined };

export type LinkedPolicyFile = { readonly targetPath: string; remove(): void };

export const resolveTool: (name: string, location?: ToolLocation) => ResolvedTool =
  resolveUntypedTool;

export const isToolInstalled: (name: string, location?: ToolLocation) => boolean =
  untypedIsToolInstalled;

export const projectFilesUnder: (
  root: string,
  options: {
    readonly includeIgnored: boolean;
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => string[] = untypedProjectFilesUnder;

export const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

export const toolNameForPath: (relativeToolPath: string) => string = untypedToolNameForPath;

export const spawnSyncWithOutputFile: (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string> = spawnUntypedWithOutputFile;

export const trackTemporaryPath: (filePath: string) => string = trackUntypedTemporaryPath;

export const untrackTemporaryPath: (filePath: string) => void = untrackUntypedTemporaryPath;

export const linkPolicyFile: (
  sourcePath: string,
  targetPath: string,
  transform: unknown,
) => LinkedPolicyFile = linkUntypedPolicyFile;

export function toolBinaryPath(
  name: string,
  location: ToolLocation & { readonly bin: string },
): string {
  const { binPath } = resolveTool(name, location);
  if (binPath === undefined) {
    throw new Error(`Tool ${name} has no binary ${location.bin}`);
  }
  return binPath;
}
