import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { fixerError, runFixCommand } from '../../../../core/fix/common/fix-command.mjs';
import { readBytes } from '../../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../../core/fix/common/fix-notes.mjs';
import { snapshotOf } from '../../../../core/fix/engine/edits/snapshot.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { realTemporaryDirectory } from '../../../../core/tooling/temporary-files.mjs';
import { knipConfigFile } from '../../adapters/quality-areas/knip/knip-run.mts';
import { layeredKnipConfig } from '../../adapters/quality-areas/knip/knip-layers.mts';
import { spawnedEntryFiles } from '../../adapters/dependency-graph/spawned-entries.mts';
import { KNIP_TOOL } from '../../preset/project-tools/project-config-files.mjs';
import { projectToolLayer } from '../../preset/project-tools/project-tool-policy.mjs';
import { layoutKnipConfig } from '../../preset/tool-configs.mjs';
import { copyProject } from './project-copy.mjs';
import { knipFixTypes } from './knip-fix-types.mjs';

const resolveKnip = resolveTool as (
  name: string,
  options: { readonly bin: string },
) => { readonly binPath: string };

type Edit =
  | { readonly type: 'delete'; readonly path: string }
  | {
      readonly type: 'write';
      readonly path: string;
      readonly text: string;
    };
type Planned = { readonly name: string; readonly edit: Edit; readonly deleted?: boolean };
export type KnipFixSettings = {
  readonly projectRoot: string;
  readonly layout: unknown;
  readonly knipSettings: unknown;
  readonly selectedRules?: readonly string[];
  readonly policyEnvironment: unknown;
  readonly executeFixCommand: unknown;
  readonly writer: {
    readonly apply: (
      snapshot: unknown,
      fixes: readonly { name: string; fix: { edits: readonly Edit[] } }[],
      tool: string,
    ) => {
      readonly applied: readonly { name: string }[];
      readonly changedMeanwhile: readonly string[];
      readonly errors: readonly string[];
    };
  };
};
export type FixFile = { readonly path: string };

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
  return [
    resolveKnip('knip', { bin: 'bin/knip.js' }).binPath,
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
  return original.endsWith('\n') || !text.endsWith('\n') ? text : text.slice(0, -1);
}

function plannedEdits(copyRoot: string, before: Map<string, Buffer>): Planned[] {
  return [...before].flatMap(([name, bytes]): Planned[] => {
    const copy = containedPath(copyRoot, name);
    if (!existsSync(copy)) {
      return [{ name, edit: { type: 'delete', path: name }, deleted: true }];
    }
    const original = bytes.toString('utf8');
    const text = keepsTrailingNewline(original, readFileSync(copy, 'utf8'));
    return text === original ? [] : [{ name, edit: { type: 'write', path: name, text } }];
  });
}

function writePlanned(settings: KnipFixSettings, before: Map<string, Buffer>, planned: Planned[]) {
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

export function knipFixStep(settings: KnipFixSettings, files: readonly FixFile[]) {
  const fixTypes = knipFixTypes(settings.selectedRules ?? []);
  if (files.length === 0 || fixTypes.length === 0) {
    return { toolErrors: [], notes: [] };
  }
  const before = readBytes(settings.projectRoot, files);
  const copyRoot = mkdtempSync(path.join(realTemporaryDirectory(), 'nitpicker-knip-fix-'));
  try {
    runKnipOnCopy(settings, fixTypes, copyRoot);
    const written = writePlanned(settings, before, plannedEdits(copyRoot, before));
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
      ],
    };
  } catch (error) {
    return { toolErrors: [fixerError('knip-fix', error)], notes: [] };
  } finally {
    rmSync(copyRoot, { force: true, recursive: true });
  }
}
