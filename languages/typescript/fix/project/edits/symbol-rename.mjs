import { changesToEdits, declined } from './text-edits.mjs';

export function renameEdits(project, { name, offset, newName, accepts }) {
  const locations = project.service.findRenameLocations(
    project.absolute(name),
    offset,
    false,
    false,
    { providePrefixAndSuffixTextForRename: true },
  );
  if (locations === undefined || locations.length === 0) {
    return declined('the language service finds no rename locations');
  }
  const changes = Map.groupBy(locations, ({ fileName }) => fileName);
  const edits = changesToEdits(
    project,
    [...changes].map(([fileName, found]) => ({
      fileName,
      textChanges: found.map((location) => ({
        span: location.textSpan,
        newText: `${location.prefixText ?? ''}${newName}${location.suffixText ?? ''}`,
      })),
    })),
    accepts,
  );
  return edits === undefined
    ? declined('a reference sits in a file --fix does not cover')
    : { edits };
}
