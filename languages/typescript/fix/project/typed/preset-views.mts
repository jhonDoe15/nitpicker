import { helperName as untypedHelperName } from '../../../preset/eslint-plugin/test-placement/no-test-helpers-in-source.mjs';
import { testAreaGlobsFor as untypedTestAreaGlobsFor } from '../../../preset/eslint-config/strict-tests.mjs';
import {
  existingRoots as untypedExistingRoots,
  globMatcher as untypedGlobMatcher,
} from '../../../preset/layout.mjs';
import {
  fileNameComplies as untypedFileNameComplies,
  fileNameParts as untypedFileNameParts,
  fileNameRuleOptions as untypedFileNameRuleOptions,
} from '../../../conventions/file-name-casing.mjs';
import { nearestManifest as untypedNearestManifest } from '../../../preset/eslint-plugin/rules/dependencies/package-manifest.mjs';
import { moveToDependencies as untypedMoveToDependencies } from '../manifest/manifest-move.mjs';
import type { FixHeadPolicy, FixLayout, ProjectEdit } from './project-types.mts';

type GlobMatcher = { test(name: string): boolean };

const helperName: (
  filename: string,
  options: { readonly colocated: boolean },
) => string | undefined = untypedHelperName;

const testAreaGlobsFor: (layout: FixLayout) => readonly string[] = untypedTestAreaGlobsFor;

const existingRoots: (projectRoot: string, roots: readonly string[]) => readonly string[] =
  untypedExistingRoots;

const globMatcher: (glob: string) => GlobMatcher = untypedGlobMatcher;

const fileNameComplies: (
  file: string,
  casing: string | undefined,
  text: string | undefined,
) => boolean = untypedFileNameComplies;

const fileNameParts: (file: string) => { readonly name: string; readonly base: string } =
  untypedFileNameParts;

const fileNameRuleOptions: (headPolicy: FixHeadPolicy) => unknown = untypedFileNameRuleOptions;

const nearestManifest: (
  directory: string,
) => { readonly kind: string; readonly file: string } | undefined = untypedNearestManifest;

const moveToDependencies: (
  name: string,
  text: string,
  packageName: string,
) => readonly ProjectEdit[] | undefined = untypedMoveToDependencies;

export {
  existingRoots,
  moveToDependencies,
  nearestManifest,
  fileNameComplies,
  fileNameParts,
  fileNameRuleOptions,
  globMatcher,
  helperName,
  testAreaGlobsFor,
};
