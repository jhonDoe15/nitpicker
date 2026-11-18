import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { classFiles } from '../../builds/classes/class-file.mjs';
import { referencedNames, usesArchive } from '../../builds/classes/class-references.mjs';
import { type XmlElement, childrenNamed, parseXml } from '../../../../shared/values/xml.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

type Declared = {
  readonly group: string;
  readonly name: string;
  readonly scope: string;
  readonly optional: boolean;
};
type Resolved = { readonly groupId: unknown; readonly artifactId: unknown };
type Usage = { readonly resolved: readonly unknown[]; readonly names: unknown };
type DependencyRun = Readonly<Record<string, unknown>> & {
  readonly module: unknown;
  readonly resolved: unknown;
  readonly reactor: unknown;
};

const COMPILE_SCOPE = 'compile';
const GROUP_ID = 'groupId';

function childText(element: XmlElement, name: string): string | undefined {
  return childrenNamed(element, name)[0]?.text;
}

export function declaredDependencies(pomText: string): Declared[] {
  const project = parseXml(pomText);
  const list = childrenNamed(project, 'dependencies')[0];
  return (list === undefined ? [] : childrenNamed(list, 'dependency'))
    .map((dependency) => ({
      group: childText(dependency, GROUP_ID) ?? '',
      name: childText(dependency, 'artifactId') ?? '',
      scope: childText(dependency, 'scope') ?? COMPILE_SCOPE,
      optional: childText(dependency, 'optional') === 'true',
    }))
    .filter((dependency) => dependency.scope === COMPILE_SCOPE && !dependency.optional);
}

function sameArtifact(declared: Declared, resolved: unknown): boolean {
  return (
    fieldOf(resolved, 'artifactId') === declared.name &&
    (declared.group.includes('${') || fieldOf(resolved, GROUP_ID) === declared.group)
  );
}

function isArchive(file: string): boolean {
  return existsSync(file) && (file.endsWith('.jar') || statSync(file).isDirectory());
}

function declaredEntry(declared: Declared, { resolved, names }: Usage): Record<string, unknown> {
  const archives = resolved
    .filter((entry) => fieldOf(entry, 'scope') === COMPILE_SCOPE && sameArtifact(declared, entry))
    .map((entry) => textOf(fieldOf(entry, 'file')))
    .filter((file) => isArchive(file));
  const match = resolved.find((entry) => sameArtifact(declared, entry));
  return {
    configuration: COMPILE_SCOPE,
    group: fieldOf(match, GROUP_ID) ?? declared.group,
    name: declared.name,
    archives: archives.map((file) => path.basename(file)),
    used: archives.some((archive) => usesArchive(archive, names)),
  };
}

function splitCoordinates(coordinates: string): Resolved {
  const [groupId, artifactId] = coordinates.split(':');
  return { groupId, artifactId };
}

export function dependencyReport(run: DependencyRun): Record<string, unknown> {
  const module = mavenModuleOf(run.module);
  const outputDirectory = textOf(module['outputDirectory']);
  const pomFile = textOf(module['pomFile']);
  const names: unknown = referencedNames([outputDirectory]);
  const reactor = textsOf(run.reactor);
  const declared = declaredDependencies(readFileSync(pomFile, 'utf8')).filter(
    (dependency) =>
      !reactor.some((coordinates) => sameArtifact(dependency, splitCoordinates(coordinates))),
  );
  const resolved = listOf(run.resolved);
  return {
    build: 'maven',
    buildFile: path.relative(module.basedir, pomFile).split(path.sep).join('/'),
    analyzed: listOf(classFiles(outputDirectory)).length > 0,
    declared: declared.map((dependency) => declaredEntry(dependency, { resolved, names })),
  };
}

export function runDependencies(
  run: Readonly<Record<string, unknown>> & { readonly reportDir: string },
): void {
  writeFileSync(
    path.join(run.reportDir, 'dependencies.json'),
    JSON.stringify(
      dependencyReport({
        module: run['module'],
        resolved: fieldOf(run['classpaths'], 'dependencies'),
        reactor: run['reactor'],
      }),
    ),
  );
}
