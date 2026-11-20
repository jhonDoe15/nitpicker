import type { FileChange } from '../../../../../core/policy-changes/types/policy-types.mts';
import { loosenedChange } from '../../project-tools/changes/applied-values.mts';
import { shownValue } from '../../project-tools/config-values.mts';
import type { AppliedChange } from '../../project-tools/typed/tool-types.mts';

export function typescriptConfigChanges({ base, head, file, files }: AppliedChange): FileChange[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => base[key] !== head[key])
    .map((key) => {
      const text = `typescript ${String(file)} ${key}: ${shownValue(base[key])} -> ${shownValue(head[key])}`;
      return base[key] === true && head[key] !== true
        ? loosenedChange(text, files)
        : { changed: text };
    });
}
