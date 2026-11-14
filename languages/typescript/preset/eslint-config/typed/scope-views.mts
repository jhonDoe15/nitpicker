import {
  hasScopePackage as untypedHasScopePackage,
  isReactNativePackage as untypedIsReactNativePackage,
  productionScope as untypedProductionScope,
  reactMajorOf as untypedReactMajorOf,
  readDependencyNames as untypedReadDependencyNames,
  readManifest as untypedReadManifest,
  storyGlobs as untypedStoryGlobs,
  testsCleanUpAutomatically as untypedTestsCleanUpAutomatically,
} from '../scope-support.mjs';
import type { ScopeLayout } from './config-types.mts';

type Manifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};

export const productionScope: (layout: ScopeLayout) => { files: string[]; ignores: string[] } =
  untypedProductionScope;

export const hasScopePackage: (projectRoot: string, scope: 'react' | 'i18n') => boolean =
  untypedHasScopePackage;

export const readManifest: (projectRoot: string) => Manifest | undefined = untypedReadManifest;

export const readDependencyNames: (projectRoot: string) => string[] = untypedReadDependencyNames;

export const isReactNativePackage: (name: string) => boolean = untypedIsReactNativePackage;

export const reactMajorOf: (projectRoot: string) => number | undefined = untypedReactMajorOf;

export const testsCleanUpAutomatically: (projectRoot: string) => boolean =
  untypedTestsCleanUpAutomatically;

export const storyGlobs: string[] = untypedStoryGlobs;
