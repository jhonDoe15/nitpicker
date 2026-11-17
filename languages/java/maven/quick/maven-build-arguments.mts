import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MAVEN_PLUGINS } from '../maven-tools.mjs';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

const ARCHUNIT_PACKAGE = 'com.tngtech.archunit';
const TEST_SOURCE = /\.(?:java|kt|groovy)$/u;

export const PROJECT_CHECKS_OFF: readonly string[] = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
  '-Dktlint.skip=true',
  '-Ddetekt.skip=true',
];

export function dependencyListArguments(work: string): string[] {
  return [
    `${textOf(fieldOf(MAVEN_PLUGINS, 'dependency'))}:list`,
    `-DoutputFile=${path.join(work, 'dependencies', `\${project.groupId}`, `\${project.artifactId}.txt`)}`,
    '-DoutputAbsoluteArtifactFilename=true',
    '-DappendOutput=false',
  ];
}

export function dependencyFile(work: string, module: { readonly coordinates: string }): string {
  const [groupId = '', artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${String(artifactId)}.txt`);
}

function namesArchunit(root: string): boolean {
  return (
    existsSync(root) &&
    readdirSync(root, { recursive: true, withFileTypes: true }).some(
      (entry) =>
        entry.isFile() &&
        TEST_SOURCE.test(entry.name) &&
        readFileSync(path.join(entry.parentPath, entry.name), 'utf8').includes(ARCHUNIT_PACKAGE),
    )
  );
}

export function usesArchunit(modules: readonly unknown[]): boolean {
  return modules.some((module) => textsOf(fieldOf(module, 'testSourceRoots')).some(namesArchunit));
}
