import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath as untypedContainedPath } from '../../../../core/fix/common/contained-path.mjs';
import {
  fixerError as untypedFixerError,
  runFixCommand as untypedRunFixCommand,
} from '../../../../core/fix/common/fix-command.mjs';
import { readBytes as untypedReadBytes } from '../../../../core/fix/common/fix-files.mjs';
import { formatNotes as untypedFormatNotes } from '../../../../core/fix/common/fix-notes.mjs';
import { snapshotOf as untypedSnapshotOf } from '../../../../core/fix/engine/edits/snapshot.mjs';
import {
  PACKAGE_ROOT,
  resolveTool as untypedResolveTool,
} from '../../../../core/tooling/tool-resolution.mjs';
import { realTemporaryDirectory as untypedRealTemporaryDirectory } from '../../../../core/tooling/temporary-files.mjs';
import type {
  FixEdit,
  FixFile,
  FixSettings,
  FixStep,
} from '../../../../core/fix/typed/fix-types.mts';
import { knipConfigFile } from '../../adapters/quality-areas/knip/knip-run.mts';
import { layeredKnipConfig } from '../../adapters/quality-areas/knip/knip-layers.mts';
import { spawnedEntryFiles } from '../../adapters/dependency-graph/spawned-entries.mts';
import { KNIP_TOOL } from '../../preset/project-tools/project-config-files.mjs';
import { projectToolLayer as untypedProjectToolLayer } from '../../preset/project-tools/project-tool-policy.mjs';
import { layoutKnipConfig as untypedLayoutKnipConfig } from '../../preset/tool-configs.mjs';
import { guardDeletions as untypedGuardDeletions } from '../project/dead-files/dead-file-guard.mjs';
import { copyProject as untypedCopyProject } from './project-copy.mjs';
import { knipFixTypes as untypedKnipFixTypes } from './knip-fix-types.mjs';

type Planned = { readonly name: string; readonly edit: FixEdit; readonly deleted: boolean };
type Bytes = ReadonlyMap<string, Buffer>;
type KnipLayer = Parameters<typeof layeredKnipConfig>[1];
type KnipBase = { readonly entry: readonly string[]; readonly [key: string]: unknown };

export type KnipFixSettings = FixSettings & {
  readonly layout: unknown;
  readonly knipSettings: unknown;
  readonly policyEnvironment: NodeJS.ProcessEnv;
};

const containedPath: (root: string, name: string) => string = untypedContainedPath;
const fixerError: (tool: string, error: unknown) => unknown = untypedFixerError;
const runFixCommand: (command: {
  readonly operation: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly acceptedStatuses: readonly number[];
  readonly environment: NodeJS.ProcessEnv;
  readonly input: undefined;
  readonly executeFixCommand: FixSettings['executeFixCommand'];
}) => unknown = untypedRunFixCommand;
const readBytes: (projectRoot: string, files: readonly FixFile[]) => Bytes = untypedReadBytes;
const formatNotes: (
  tool: string,
  outcome: {
    readonly rewritten: readonly string[];
    readonly changedMeanwhile: readonly string[];
    readonly unwritable: readonly string[];
    readonly unformattable: readonly string[];
    readonly keptAsIs: readonly string[];
  },
) => string[] = untypedFormatNotes;
const snapshotOf: (bytes: Bytes) => unknown = untypedSnapshotOf;
const resolveKnip: (
  name: string,
  options: { readonly bin: string; readonly packageRoot?: string },
) => { readonly binPath: string | undefined } = untypedResolveTool;
const realTemporaryDirectory: () => string = untypedRealTemporaryDirectory;
const projectToolLayer: (tool: string, settings: unknown) => KnipLayer = untypedProjectToolLayer;
const layoutKnipConfig: (config: unknown, layout: unknown) => KnipBase = untypedLayoutKnipConfig;
const guardDeletions: (
  projectRoot: string,
  planned: readonly Planned[],
) => { readonly planned: readonly Planned[]; readonly notes: readonly string[] } =
  untypedGuardDeletions;
const copyProject: (projectRoot: string, target: string) => void = untypedCopyProject;
const knipFixTypes: (selectedRules: readonly string[]) => readonly string[] = untypedKnipFixTypes;

const TOOL = 'knip --fix';
const DEFAULTS = 'languages/typescript/preset/defaults/knip.json';

function knipConfig(settings: KnipFixSettings) {
  const base = layoutKnipConfig(
    JSON.parse(readFileSync(path.join(PACKAGE_ROOT, DEFAULTS), 'utf8')),
    settings.layout,
  );
  const withEntries = {
    ...base,
    entry: [...base.entry, ...spawnedEntryFiles(settings.projectRoot)],
  };
  return layeredKnipConfig(withEntries, projectToolLayer(KNIP_TOOL, settings.knipSettings));
}

function knipArguments(configPath: string, fixTypes: readonly string[]): string[] {
  const { binPath } = resolveKnip('knip', { bin: 'bin/knip.js' });
  if (binPath === undefined) {
    throw new Error('knip is not installed');
  }
  return [
    binPath,
    '--config',
    configPath,
    '--fix',
    '--fix-type',
    fixTypes.join(','),
    ...(fixTypes.includes('files') ? ['--allow-remove-files'] : []),
    '--no-progress',
    '--reporter',
    'json',
  ];
}

function runKnipOnCopy(
  settings: KnipFixSettings,
  fixTypes: readonly string[],
  copyRoot: string,
): void {
  copyProject(settings.projectRoot, copyRoot);
  const config = knipConfigFile(copyRoot, knipConfig(settings));
  writeFileSync(config.path, config.text);
  runFixCommand({
    operation: 'knip-fix',
    command: process.execPath,
    args: knipArguments(config.path, fixTypes),
    cwd: copyRoot,
    acceptedStatuses: [0, 1],
    environment: settings.policyEnvironment,
    input: undefined,
    executeFixCommand: settings.executeFixCommand,
  });
  rmSync(config.path, { force: true });
}

function keepsTrailingNewline(original: string, text: string): string {
  const hadNewline = original.endsWith('\n');
  if (hadNewline === text.endsWith('\n')) {
    return text;
  }
  return hadNewline ? `${text}\n` : text.replace(/\r?\n$/u, '');
}

function plannedEdits(copyRoot: string, before: Bytes): Planned[] {
  return [...before].flatMap(([name, bytes]): Planned[] => {
    const copy = containedPath(copyRoot, name);
    if (!existsSync(copy)) {
      return [{ name, edit: { type: 'delete', path: name }, deleted: true }];
    }
    const original = bytes.toString('utf8');
    const text = keepsTrailingNewline(original, readFileSync(copy, 'utf8'));
    return text === original
      ? []
      : [{ name, edit: { type: 'write', path: name, text }, deleted: false }];
  });
}

function writePlanned(settings: KnipFixSettings, before: Bytes, planned: readonly Planned[]) {
  const snapshot = snapshotOf(before);
  const { applied, changedMeanwhile, errors } = settings.writer.apply(
    snapshot,
    planned.map(({ name, edit }) => ({ name, fix: { edits: [edit] } })),
    TOOL,
  );
  const written = new Set(applied.map(({ name }) => name));
  const deleted = planned.filter(({ name, deleted: gone }) => gone && written.has(name));
  return {
    rewritten: planned
      .filter(({ name, deleted: gone }) => !gone && written.has(name))
      .map(({ name }) => name),
    deleted: deleted.map(({ name }) => name),
    changedMeanwhile,
    unwritable: errors,
  };
}

export function knipFixStep(settings: KnipFixSettings, files: readonly FixFile[]): FixStep {
  const fixTypes = knipFixTypes(settings.selectedRules);
  if (files.length === 0 || fixTypes.length === 0) {
    return { toolErrors: [], notes: [] };
  }
  const before = readBytes(settings.projectRoot, files);
  const copyRoot = mkdtempSync(path.join(realTemporaryDirectory(), 'nitpicker-knip-fix-'));
  try {
    runKnipOnCopy(settings, fixTypes, copyRoot);
    const guarded = guardDeletions(settings.projectRoot, plannedEdits(copyRoot, before));
    const written = writePlanned(settings, before, guarded.planned);
    return {
      toolErrors: [],
      notes: [
        ...formatNotes(TOOL, {
          rewritten: written.rewritten,
          changedMeanwhile: written.changedMeanwhile,
          unwritable: written.unwritable,
          unformattable: [],
          keptAsIs: [],
        }),
        ...written.deleted.map((name) => `${TOOL} deleted ${name}`),
        ...guarded.notes,
      ],
    };
  } catch (error) {
    return { toolErrors: [fixerError('knip-fix', error)], notes: [] };
  } finally {
    rmSync(copyRoot, { force: true, recursive: true });
  }
}
