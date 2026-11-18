import { referencedNames, usesArchive } from '../../builds/classes/class-references.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

export type Build = 'gradle' | 'maven';
export type Entry = {
  readonly group: string;
  readonly name: string;
  readonly configuration?: string;
  readonly archives?: readonly unknown[];
  readonly archivePaths?: readonly string[];
  readonly used: boolean;
};
export type DependencyReport = {
  readonly analyzed: boolean;
  readonly build?: Build;
  readonly buildFile?: string;
  readonly declared?: readonly Entry[];
  readonly classDirectories?: readonly string[];
};
export type DependencyFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

export const referenced: (classDirectories: readonly string[]) => ReadonlySet<string> =
  referencedNames;
export const archiveUsed: (archive: string, names: ReadonlySet<string>) => boolean = usesArchive;

function entryOf(value: unknown): Entry {
  return {
    group: textOf(fieldOf(value, 'group')),
    name: textOf(fieldOf(value, 'name')),
    configuration: textOf(fieldOf(value, 'configuration')),
    archives: listOf(fieldOf(value, 'archives')),
    archivePaths: textsOf(fieldOf(value, 'archivePaths')),
    used: fieldOf(value, 'used') === true,
  };
}

export function reportOf(value: unknown): DependencyReport {
  const classDirectories = fieldOf(value, 'classDirectories');
  const buildFile = fieldOf(value, 'buildFile');
  return {
    analyzed: fieldOf(value, 'analyzed') === true,
    build: fieldOf(value, 'build') === 'maven' ? 'maven' : 'gradle',
    ...(typeof buildFile === 'string' ? { buildFile } : {}),
    declared: listOf(fieldOf(value, 'declared')).map(entryOf),
    ...(classDirectories === undefined ? {} : { classDirectories: textsOf(classDirectories) }),
  };
}
