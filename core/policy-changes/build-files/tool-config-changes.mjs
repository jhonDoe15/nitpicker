import { jscpdConfigChanges } from '../../tooling/jscpd/config-changes.mjs';
import { projectConfigChanges } from '../../../languages/typescript/preset/project-tools/changes/project-config-changes.mjs';

function fileChange(tool, file, { base, head, evidence, optsIn }) {
  if (base.get(file) === head.get(file)) {
    return undefined;
  }
  return head.has(file)
    ? {
        loosened: {
          text: `${tool} project config changed: ${file}`,
          kind: optsIn === true ? 'tool-config-opt-in' : 'tool-config',
          files: [file],
          ...(evidence?.has(file) ? { blobs: { [file]: evidence.get(file) } } : {}),
        },
      }
    : { changed: `${tool} project config removed: ${file}` };
}

function replacedOptionChanges({ replacedOptions, head }) {
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

function fileChanges(entry) {
  if (entry.applied !== undefined) {
    return entry.tool === 'jscpd'
      ? jscpdConfigChanges(entry.applied)
      : projectConfigChanges(entry.tool, entry.applied);
  }
  const files = [...new Set([...entry.base.keys(), ...entry.head.keys()])].toSorted();
  return [
    ...files.map((file) => fileChange(entry.tool, file, entry)),
    ...replacedOptionChanges(entry),
  ];
}

export function toolConfigChanges(scope) {
  const results = (scope.toolConfigs ?? []).flatMap(fileChanges).filter(Boolean);
  return {
    loosened: results.flatMap((result) => result.loosened ?? []),
    changed: results.flatMap((result) => result.changed ?? []),
  };
}
