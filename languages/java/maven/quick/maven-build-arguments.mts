import path from 'node:path';
import { MAVEN_PLUGINS } from '../maven-tools.mjs';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

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
