import { strykerConfigChanges } from '../../../languages/typescript/preset/project-configs/stryker-config-changes.mjs';
import { testRunnerConfigChanges } from '../../../languages/typescript/preset/project-configs/test-runner/test-runner-config-changes.mjs';
import { typescriptConfigChanges } from '../../../languages/typescript/preset/project-configs/typescript/typescript-config-changes.mjs';
import { jscpdConfigChanges } from '../../tooling/jscpd/config-changes.mjs';

const APPLIED_CHANGES = new Map([
  ['jscpd', jscpdConfigChanges],
  ['stryker', strykerConfigChanges],
  ['typescript', typescriptConfigChanges],
  ['tests', testRunnerConfigChanges],
]);

function fileChange(tool, file, { base, head }) {
  if (base.get(file) === head.get(file)) {
    return undefined;
  }
  return head.has(file)
    ? {
        loosened: {
          text: `${tool} project config changed: ${file}`,
          kind: 'tool-config',
          files: [file],
        },
      }
    : { changed: `${tool} project config removed: ${file}` };
}

function fileChanges(entry) {
  if (entry.applied !== undefined) {
    return APPLIED_CHANGES.get(entry.tool)(entry.applied);
  }
  const files = [...new Set([...entry.base.keys(), ...entry.head.keys()])].toSorted();
  return files.map((file) => fileChange(entry.tool, file, entry));
}

export function toolConfigChanges(scope) {
  const results = (scope.toolConfigs ?? []).flatMap(fileChanges).filter(Boolean);
  return {
    loosened: results.flatMap((result) => result.loosened ?? []),
    changed: results.flatMap((result) => result.changed ?? []),
  };
}
