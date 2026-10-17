export function toolConfigChanges(scope) {
  const loosened = [];
  const changed = [];
  for (const { tool, base, head } of scope.toolConfigs ?? []) {
    for (const file of [...new Set([...base.keys(), ...head.keys()])].toSorted()) {
      if (base.get(file) === head.get(file)) {
        continue;
      }
      if (head.has(file)) {
        loosened.push({ text: `${tool} project config changed: ${file}`, files: [file] });
      } else {
        changed.push(`${tool} project config removed: ${file}`);
      }
    }
  }
  return { loosened, changed };
}
