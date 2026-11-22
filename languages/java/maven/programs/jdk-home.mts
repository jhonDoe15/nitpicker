import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

type Environment = Readonly<Record<string, string | undefined>>;

function javaCommands(folder: string): string[] {
  return [path.join(folder, 'java'), path.join(folder, 'java.exe')];
}

function javaOnPath(environment: Environment): string | undefined {
  const listed = Object.entries(environment).find(([name]) => name.toUpperCase() === 'PATH')?.[1];
  return (listed ?? '')
    .split(path.delimiter)
    .filter((folder) => folder !== '')
    .flatMap(javaCommands)
    .find((candidate) => existsSync(candidate));
}

export function jdkHome(environment: Environment): string {
  const home = environment['JAVA_HOME'];
  if (home !== undefined && javaCommands(path.join(home, 'bin')).some((java) => existsSync(java))) {
    return home;
  }
  const java = javaOnPath(environment);
  return java === undefined ? '' : path.dirname(path.dirname(realpathSync(java)));
}
