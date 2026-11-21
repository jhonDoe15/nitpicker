import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

type Environment = Readonly<Record<string, string | undefined>>;

const JAVA_NAMES = ['java', 'java.exe'];

function javaOnPath(environment: Environment): string | undefined {
  return (environment['PATH'] ?? '')
    .split(path.delimiter)
    .filter((folder) => folder !== '')
    .flatMap((folder) => JAVA_NAMES.map((name) => path.join(folder, name)))
    .find((candidate) => existsSync(candidate));
}

export function jdkHome(environment: Environment): string {
  const home = environment['JAVA_HOME'];
  if (home !== undefined && JAVA_NAMES.some((name) => existsSync(path.join(home, 'bin', name)))) {
    return home;
  }
  const java = javaOnPath(environment);
  return java === undefined ? '' : path.dirname(path.dirname(realpathSync(java)));
}
