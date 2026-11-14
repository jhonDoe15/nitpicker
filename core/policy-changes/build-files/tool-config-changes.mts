import {
  jscpdConfigChanges,
  projectConfigChanges,
  strykerConfigChanges,
  testsConfigChanges,
  typescriptConfigChanges,
} from '../types/tool-views.mts';
import type {
  AppliedValues,
  ChangePart,
  FileChange,
  PolicyScope,
  ToolConfigEntry,
  ToolFileEntry,
} from '../types/policy-types.mts';
import { importLinterChanges } from './import-linter-changes.mts';

const OWN_APPLIED_CHANGES = new Map([
  ['jscpd', jscpdConfigChanges],
  ['stryker', strykerConfigChanges],
  ['typescript', typescriptConfigChanges],
  ['tests', testsConfigChanges],
]);

function appliedChanges({ tool, applied }: { tool: string; applied: AppliedValues }): FileChange[] {
  const own = OWN_APPLIED_CHANGES.get(tool);
  return own === undefined
    ? projectConfigChanges(tool, applied)
    : own({ file: undefined, ...applied });
}

function fileChange(
  tool: string,
  file: string,
  { base, head, evidence, optsIn }: ToolFileEntry,
): FileChange | undefined {
  if (base.get(file) === head.get(file)) {
    return undefined;
  }
  const blob = evidence?.get(file);
  return head.has(file)
    ? {
        loosened: {
          text: `${tool} project config changed: ${file}`,
          kind: optsIn ? 'tool-config-opt-in' : 'tool-config',
          files: [file],
          ...(blob === undefined ? {} : { blobs: { [file]: blob } }),
        },
      }
    : { changed: `${tool} project config removed: ${file}` };
}

function replacedOptionChanges({ replacedOptions, head }: ToolFileEntry): FileChange[] {
  if (replacedOptions === undefined) {
    return [];
  }
  const files = [...head.keys()].slice(0, 1);
  const texts =
    replacedOptions.error === undefined
      ? replacedOptions.rules.map(
          (rule) => `eslint project config replaces the options of nitpicker rule ${rule}`,
        )
      : [
          `eslint project config could not be loaded to list the nitpicker rules whose options it replaces: ${replacedOptions.error}`,
        ];
  return texts.map((text) => ({ loosened: { text, kind: 'tool-config', files } }));
}

function fileChanges(entry: ToolConfigEntry): (FileChange | undefined)[] {
  if (entry.importLinter !== undefined) {
    return importLinterChanges(entry.importLinter);
  }
  if (entry.applied !== undefined) {
    return appliedChanges({ tool: entry.tool, applied: entry.applied });
  }
  const files = [...new Set([...entry.base.keys(), ...entry.head.keys()])].toSorted();
  return [
    ...files.map((file) => fileChange(entry.tool, file, entry)),
    ...replacedOptionChanges(entry),
  ];
}

export function toolConfigChanges(scope: PolicyScope): ChangePart {
  const results = scope.toolConfigs.flatMap(fileChanges).filter((result) => result !== undefined);
  return {
    loosened: results.flatMap((result) => result.loosened ?? []),
    changed: results.flatMap((result) => result.changed ?? []),
  };
}
