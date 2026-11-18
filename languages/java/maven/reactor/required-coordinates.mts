import { existsSync, readFileSync } from 'node:fs';
import { type XmlElement, childAt, childrenAt, parseXml } from '../../../../shared/values/xml.mts';
import { textAt } from '../configuration/pom-elements.mts';

const GROUP_ID = 'groupId';
const DEPENDENCIES = 'dependencies';
const DEPENDENCY = 'dependency';

export function coordinates(project: XmlElement): string {
  const groupId = textAt(project, GROUP_ID) ?? textAt(project, 'parent', GROUP_ID);
  return `${String(groupId)}:${String(textAt(project, 'artifactId'))}`;
}

function coordinatesOf(element: XmlElement): string[] {
  const groupId = textAt(element, GROUP_ID);
  const artifactId = textAt(element, 'artifactId');
  return groupId === undefined || artifactId === undefined ? [] : [`${groupId}:${artifactId}`];
}

function importedCoordinates(project: XmlElement): string[] {
  return childrenAt(project, 'dependencyManagement', DEPENDENCIES, DEPENDENCY)
    .filter((dependency) =>
      ['import', 'pom'].includes(textAt(dependency, 'scope') ?? textAt(dependency, 'type') ?? ''),
    )
    .flatMap(coordinatesOf);
}

export function requiredCoordinates(
  project: XmlElement,
  plugins: ReadonlyMap<string, XmlElement>,
  pomFile: string,
): string[] {
  const parent = childAt(project, 'parent');
  return [
    ...(parent === undefined ? [] : coordinatesOf(parent)),
    ...childrenAt(project, DEPENDENCIES, DEPENDENCY).flatMap(coordinatesOf),
    ...importedCoordinates(project),
    ...(existsSync(pomFile) ? importedCoordinates(parseXml(readFileSync(pomFile, 'utf8'))) : []),
    ...[...plugins.entries()].flatMap(([key, plugin]) => [
      key,
      ...childrenAt(plugin, DEPENDENCIES, DEPENDENCY).flatMap(coordinatesOf),
    ]),
  ];
}
