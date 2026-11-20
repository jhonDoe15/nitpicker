import type { StoryComponent } from './structure-types.mts';
import {
  isStorybookPackage as untypedIsStorybookPackage,
  readDependencyNames as untypedReadDependencyNames,
  storySuffixes as untypedStorySuffixes,
} from '../../eslint-config/scope-support.mts';
import {
  DEFAULT_EXPORT as untypedDefaultExport,
  exportedComponents as untypedExportedComponents,
} from '../../syntax/exported-components.mts';

export const isStorybookPackage: (name: string) => boolean = untypedIsStorybookPackage;

export const readDependencyNames: (directory: string) => string[] = untypedReadDependencyNames;

export const storySuffixes: string[] = untypedStorySuffixes;

export const DEFAULT_EXPORT: string = untypedDefaultExport;

export const exportedComponents: (text: string, fileName: string) => StoryComponent[] =
  untypedExportedComponents;
