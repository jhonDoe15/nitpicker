import type { Planned, Project, ReplaceEdit } from '../typed/project-types.mts';
import { changesToEdits, declined } from './text-edits.mts';

export function renameEdits(
  project: Project,
  {
    name,
    offset,
    newName,
    accepts,
  }: {
    readonly name: string;
    readonly offset: number;
    readonly newName: string;
    readonly accepts: (name: string) => boolean;
  },
): Planned<ReplaceEdit> {
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
