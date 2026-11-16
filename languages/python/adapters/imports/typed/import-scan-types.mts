import type { Dirent } from 'node:fs';
import type {
  DeclaredDependencies,
  DependencyEntry,
} from '../../../libraries/typed/dependency-types.mts';
import type { ImportsReport } from '../../analysis/typed/python-graph-types.mts';

export type DistributionScan = {
  readonly stdlib?: readonly string[] | undefined;
  readonly modules?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly importable?: readonly string[] | undefined;
};

export type DeclaredNames = Pick<DeclaredDependencies, 'manifest'> & {
  readonly dependencies: readonly DependencyEntry[];
};

export type UnresolvedRequest = {
  readonly projectRoot: string;
  readonly imports: ImportsReport;
  readonly scan: DistributionScan;
  readonly declared: DeclaredNames;
};

export type ModuleCaches = {
  readonly listings: Map<string, Dirent[]>;
  readonly rewiring: Map<string, boolean>;
};

export type ModuleFiles = {
  missingPart(relative: string, parts: readonly string[]): number;
  hasModule(relative: string, name: string): boolean;
  isRegularPackage(relative: string): boolean;
  rewires(relative: string): boolean;
};

export type ProjectFiles = {
  readonly files: ModuleFiles;
  readonly buildsExtensions: boolean;
};
