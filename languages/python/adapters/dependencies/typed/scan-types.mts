import {
  fieldOf,
  listOf,
  parseJson,
  textListsOf,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';
import type { DistributionScan as ImportScan } from '../../imports/typed/import-scan-types.mts';
import type { ImportsReport } from '../../analysis/typed/python-graph-types.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type {
  DependencyEntry,
  DeclaredDependencies,
} from '../../../libraries/typed/dependency-types.mts';

export type DistributionScan = ImportScan & {
  readonly python: readonly number[];
  readonly entryPoints?: readonly string[];
  readonly optional?: Readonly<Record<string, readonly string[]>>;
  readonly references?: readonly string[];
};

export type DependenciesReport = {
  readonly declared: DeclaredDependencies;
  readonly scan: DistributionScan;
  readonly environment: string;
};

function numbersOf(value: unknown): number[] {
  return listOf(value).filter((entry): entry is number => typeof entry === 'number');
}

export function scanOf(value: unknown): DistributionScan {
  const importable = fieldOf(value, 'importable');
  return {
    python: numbersOf(fieldOf(value, 'python')),
    modules: textListsOf(fieldOf(value, 'modules')),
    stdlib: textsOf(fieldOf(value, 'stdlib')),
    entryPoints: textsOf(fieldOf(value, 'entryPoints')),
    optional: textListsOf(fieldOf(value, 'optional')),
    references: textsOf(fieldOf(value, 'references')),
    ...(Array.isArray(importable) ? { importable: textsOf(importable) } : {}),
  };
}

function isDeclared(value: unknown): value is DeclaredDependencies {
  return (
    Array.isArray(fieldOf(value, 'dependencies')) && typeof fieldOf(value, 'manifest') === 'string'
  );
}

export function dependenciesReportOf(text: string): DependenciesReport {
  const parsed = parseJson(text);
  const declared = fieldOf(parsed, 'declared');
  if (!isDeclared(declared)) {
    throw new TypeError('The dependencies report is malformed');
  }
  return {
    declared,
    scan: scanOf(fieldOf(parsed, 'scan')),
    environment: textOf(fieldOf(parsed, 'environment')),
  };
}

export type Context = Pick<ToolContext, 'reportRoot' | 'projectRoot'> & {
  readonly launcher: { readonly description: string };
};
export type FileEntry = { readonly file: string };
export type ImportedTop = { top: string; distributions: string[]; typeOnly: boolean };
export type State = {
  declared: DeclaredDependencies;
  scan: DistributionScan;
  imports: ImportsReport;
  projectModules: Set<string>;
  stdlib: Set<string>;
  declaredBy: Map<string, DependencyEntry[]>;
};
export type FullState = State & { implied: Set<string> };
export type HintEntry = {
  rule: string;
  path: string;
  identity: string;
  location?: { line: number };
};

export type { DeclaredDependencies, DependencyEntry };
