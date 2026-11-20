import type { ModuleResolution } from '../../../modules/typed/module-types.mts';
import type { Definition, DefinitionFact, ExportFacts, ImportFact } from './syntax-types.mts';
import type { UnitFact } from '../near-duplicates/typed/tree-types.mts';

export type { ModuleResolution };

export type ReuseFact = {
  readonly path: string;
  readonly packageRoot: string;
  readonly definitions: readonly DefinitionFact[];
  readonly imports: readonly ImportFact[];
  readonly dynamicImports: readonly string[];
  readonly exports: ExportFacts;
  readonly jsxTags: ReadonlySet<string>;
  readonly nearDuplicateUnits: readonly UnitFact[];
};

export type Resolve = (specifier: string, from: string) => ModuleResolution;

export type ModuleOf = (specifier: string, file: string) => string;

export type ReuseLayout = {
  readonly sourceRoots: readonly string[];
  readonly isSourceFile: (file: string) => boolean;
  readonly isExcluded: (file: string) => boolean;
  readonly isTestPath: (file: string) => boolean;
  readonly isGeneratedPath: (file: string) => boolean;
  projectCodeFiles(projectRoot: string, roots?: readonly string[]): readonly string[];
};

export type SvgSize = { readonly width: number | undefined; readonly height: number | undefined };

export type SvgFile = { readonly path: string; readonly size: SvgSize };

export type Persistence = 'entity' | 'data-access';

export type NeutralName = { readonly name: string; readonly alias?: string };

export type NeutralImport = {
  readonly from: string;
  readonly to: string;
  readonly names: readonly NeutralName[];
  readonly reexport: boolean;
};

export type NeutralDefinition = {
  readonly file: string;
  readonly package: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly lines: number;
  readonly exported: boolean;
  readonly exportNames: readonly string[];
  readonly tokens: readonly string[];
  readonly untypedTokens: readonly string[];
  readonly text: string;
  readonly key: string;
  readonly size: number;
  readonly literal: boolean;
  readonly usedLocally: boolean;
  readonly entry: boolean;
};

export type NeutralModule = {
  readonly file: string;
  readonly role: 'production';
  readonly persistence?: Persistence;
};

export type NeutralFacts = {
  readonly modules: readonly NeutralModule[];
  readonly packages: readonly never[];
  readonly definitions: readonly NeutralDefinition[];
  readonly imports: readonly NeutralImport[];
  readonly nearDuplicateUnits: readonly {
    readonly file: string;
    readonly name: string;
    readonly start: number | undefined;
    readonly end: number | undefined;
    readonly tokens: number;
    readonly final: boolean;
    readonly tree: UnitFact['tree'];
  }[];
};

export type BaselineFile = {
  readonly unchanged: boolean;
  readonly definitions: readonly Definition[];
};
