import {
  frameworkConventions as untypedFrameworkConventions,
  isReactProject as untypedIsReactProject,
  readDependencyNames as untypedReadDependencyNames,
} from '../../../preset/eslint-config/scope-support.mjs';
import {
  namingConvention as untypedNamingConvention,
  usesRouteHandlerFramework as untypedUsesRouteHandlerFramework,
} from '../../../preset/eslint-config/policy/production-policy.mjs';
import { defaultExportSelectors as untypedDefaultExportSelectors } from '../../../preset/eslint-config/strict/strict-declarations.mjs';

const frameworkConventions: (projectRoot: string) => { readonly defaultExports: string[] } =
  untypedFrameworkConventions;

const isReactProject: (settings: {
  readonly projectRoot: string;
  readonly react: object | undefined;
  readonly javascript: boolean;
}) => boolean = untypedIsReactProject;

const readDependencyNames: (projectRoot: string) => string[] = untypedReadDependencyNames;

const namingConvention: (settings: {
  readonly react: boolean;
  readonly routeHandlers: boolean;
}) => readonly unknown[] = untypedNamingConvention;

const usesRouteHandlerFramework: (dependencyNames: readonly string[]) => boolean =
  untypedUsesRouteHandlerFramework;

const defaultExportSelectors: readonly unknown[] = untypedDefaultExportSelectors;

export {
  defaultExportSelectors,
  frameworkConventions,
  isReactProject,
  namingConvention,
  readDependencyNames,
  usesRouteHandlerFramework,
};
