import {
  loadInChild as untypedLoadInChild,
  loaderScript as untypedLoaderScript,
} from '../../project-configs/config-module.mts';
import {
  chainOf as untypedChainOf,
  parentDirectory as untypedParentDirectory,
} from '../../../../../shared/traversal.mts';
import type { ChildLoad } from '../../project-configs/project-config-types.mts';

export const loadInChild: (load: ChildLoad) => unknown = untypedLoadInChild;

export const loaderScript: (...body: string[]) => string = untypedLoaderScript;

export const chainOf: <T>(start: T, next: (current: T) => T | undefined) => T[] = untypedChainOf;

export const parentDirectory: (directory: string) => string | undefined = untypedParentDirectory;
