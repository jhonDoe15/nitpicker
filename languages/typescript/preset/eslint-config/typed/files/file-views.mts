import type TypeScript from 'typescript';
import { firstFileIn as untypedFirstFileIn } from '../../../../../../shared/filesystem.mjs';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../../shared/project-files/project-files.mjs';
import { propertyName as untypedPropertyName } from '../../../syntax/property-names.mts';

export const firstFileIn: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstFileIn;

export const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;

export const propertyName: (node: TypeScript.Node) => string | undefined = untypedPropertyName;
