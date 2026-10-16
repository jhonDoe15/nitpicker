import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { classFiles } from '../../builds/classes/class-file.mjs';
import { referencedNames, usesArchive } from '../../builds/classes/class-references.mjs';

const COMPILE_SCOPE = 'compile';

function textOf(element, name) {
  return childrenNamed(element, name)[0]?.text;
}

export function declaredDependencies(pomText) {
  const project = parseXml(pomText);
  const list = childrenNamed(project, 'dependencies')[0];
  return (list === undefined ? [] : childrenNamed(list, 'dependency'))
    .map((dependency) => ({
      group: textOf(dependency, 'groupId') ?? '',
      name: textOf(dependency, 'artifactId') ?? '',
      scope: textOf(dependency, 'scope') ?? COMPILE_SCOPE,
      optional: textOf(dependency, 'optional') === 'true',
    }))
    .filter((dependency) => dependency.scope === COMPILE_SCOPE && !dependency.optional);
}

function sameArtifact(declared, resolved) {
  return (
    resolved.artifactId === declared.name &&
    (declared.group.includes('${') || resolved.groupId === declared.group)
  );
}

function isArchive(file) {
  return existsSync(file) && (file.endsWith('.jar') || statSync(file).isDirectory());
}

function declaredEntry(declared, { resolved, names }) {
  const archives = resolved
    .filter((entry) => entry.scope === COMPILE_SCOPE && sameArtifact(declared, entry))
    .map((entry) => entry.file)
    .filter((file) => isArchive(file));
  const group = resolved.find((entry) => sameArtifact(declared, entry))?.groupId ?? declared.group;
  return {
    configuration: COMPILE_SCOPE,
    group,
    name: declared.name,
    archives: archives.map((file) => path.basename(file)),
    used: archives.some((archive) => usesArchive(archive, names)),
  };
}

export function dependencyReport({ module, resolved, reactor }) {
  const names = referencedNames([module.outputDirectory]);
  const declared = declaredDependencies(readFileSync(module.pomFile, 'utf8')).filter(
    (dependency) =>
      !reactor.some((coordinates) => sameArtifact(dependency, splitCoordinates(coordinates))),
  );
  return {
    build: 'maven',
    buildFile: path.relative(module.basedir, module.pomFile).split(path.sep).join('/'),
    analyzed: classFiles(module.outputDirectory).length > 0,
    declared: declared.map((dependency) => declaredEntry(dependency, { resolved, names })),
  };
}

function splitCoordinates(coordinates) {
  const [groupId, artifactId] = coordinates.split(':');
  return { groupId, artifactId };
}

export function runDependencies({ module, reportDir, classpaths, reactor }) {
  writeFileSync(
    path.join(reportDir, 'dependencies.json'),
    JSON.stringify(dependencyReport({ module, resolved: classpaths.dependencies, reactor })),
  );
}
