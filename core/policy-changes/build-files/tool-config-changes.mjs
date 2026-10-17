function fileChange(tool, file, { base, head }) {
  if (base.get(file) === head.get(file)) {
    return undefined;
  }
  return head.has(file)
    ? { loosened: { text: `${tool} project config changed: ${file}`, files: [file] } }
    : { changed: `${tool} project config removed: ${file}` };
}

function fileChanges(entry) {
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
