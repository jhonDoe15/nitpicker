import { shownValue } from '../../project-tools/config-values.mjs';

export function typescriptConfigChanges({ base, head, file, files }) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => base[key] !== head[key])
    .map((key) => {
      const text = `typescript ${file} ${key}: ${shownValue(base[key])} -> ${shownValue(head[key])}`;
      return base[key] === true && head[key] !== true
        ? { loosened: { text, kind: 'tool-config', files } }
        : { changed: text };
    });
}
