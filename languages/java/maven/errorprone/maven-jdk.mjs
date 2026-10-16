import { spawnSync } from 'node:child_process';
import { javaCommand } from '../maven-command.mjs';

const ERROR_PRONE_JDK = 21;
const VERSION = /version "(?:1\.)?(\d+)/u;

export function featureVersion(versionOutput) {
  const match = VERSION.exec(versionOutput);
  return match === null ? undefined : Number(match[1]);
}

export function errorProneJdkProblem(java, versionOutput) {
  const feature = featureVersion(versionOutput);
  if (feature !== undefined && feature >= ERROR_PRONE_JDK) {
    return undefined;
  }
  const found =
    feature === undefined ? 'a JDK whose version nitpicker could not read' : `JDK ${feature}`;
  return (
    `Error Prone needs JDK ${ERROR_PRONE_JDK} or newer, and ${java} is ${found}. ` +
    `Point JAVA_HOME at a JDK ${ERROR_PRONE_JDK} or newer (Maven and nitpicker both use it); ` +
    'the project keeps compiling for its own release'
  );
}

export function requireErrorProneJdk() {
  const java = javaCommand('java');
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const problem = errorProneJdkProblem(java, `${result.stderr}${result.stdout}`);
  if (problem !== undefined) {
    throw new Error(problem);
  }
}
