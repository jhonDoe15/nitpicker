import type { ExceptionEntry } from '../../configuration/python-exceptions.mts';
import type { PackageFacts } from '../../../rules/libraries/package-facts.mts';
import type { JsonNull, PythonModule } from '../../analysis/typed/python-graph-types.mts';

export type Site = {
  readonly line?: number | undefined;
  readonly typeOnly?: true | false;
  readonly conditional?: true | undefined;
  readonly local?: true | undefined;
};

type Alias = { readonly name: string; readonly alias?: string | JsonNull | undefined };

export type FactsImport = Site & {
  readonly level: number;
  readonly module: string | JsonNull;
  readonly names: readonly string[];
  readonly aliases: readonly Alias[];
  readonly exported?: true;
  readonly line: number;
};

export type Binding = {
  readonly kind: string;
  readonly module: string | JsonNull;
  readonly level: number;
  readonly name: string;
};

export type Definition = {
  readonly name: string;
  readonly kind: string;
  readonly tag: string;
  readonly line: number;
  readonly lines: number;
  readonly exported: boolean;
  readonly usedLocally: boolean;
  readonly literal: boolean;
  readonly tokens: readonly string[];
  readonly free: readonly { readonly name: string; readonly binding: Binding }[];
};

export type Reference = Site & { readonly name: string; readonly dynamic: boolean };

export type AttributeUse = Site & {
  readonly binding: Binding;
  readonly attributes: readonly string[];
};

type DocComment = {
  readonly line: number;
  readonly name: string;
  readonly qualifier: unknown;
  readonly lines: number;
  readonly detailed: boolean;
};

export type ScannedFile = {
  readonly imports: readonly FactsImport[];
  readonly definitions: readonly Definition[];
  readonly qualifiedUses: unknown;
  readonly exports: {
    readonly all: readonly string[] | JsonNull;
    readonly reexports: readonly { readonly line: number; readonly name: string }[];
  };
  readonly script: boolean;
  readonly docComments: readonly DocComment[];
  readonly references?: readonly Reference[];
  readonly fetchedNames?: readonly string[];
  readonly attributeUses?: readonly AttributeUse[];
  readonly nearDuplicateUnits?: readonly Readonly<Record<string, unknown>>[];
};

export type Scanned = Readonly<Record<string, ScannedFile>>;

export type NameRef = { readonly name: string; readonly alias?: string };

export type LinkTarget = {
  readonly to: string | undefined;
  readonly names: readonly NameRef[];
  readonly reexport?: true | false;
};

export type Resolver = {
  readonly fileOf: (stem: string | undefined) => string | undefined;
  readonly moduleStem: (name: string) => string | undefined;
  readonly baseStem: (
    file: string,
    reference: { readonly level: number; readonly module: string | JsonNull },
  ) => string | undefined;
  readonly filesUnder: (stem: string) => string[];
};

export type ReferenceContext = {
  readonly scanned: Scanned;
  readonly resolver: Resolver;
  readonly referenceOnly: ReadonlySet<string>;
};

export type FactsContext = ReferenceContext & {
  readonly roleOf: (file: string) => string;
  readonly isConvention: (file: string) => boolean;
  readonly isFrameworkName: (name: string) => boolean;
  readonly packageOf: (file: string) => string;
  readonly entryNames: ReadonlyMap<string, ReadonlySet<string>>;
  readonly moduleNames: ReadonlyMap<string, string>;
};

export type ImportRecord = {
  readonly from: string;
  readonly to: string;
  readonly names: NameRef[];
  readonly reexport: boolean;
  readonly role: string;
  readonly line?: number | undefined;
  readonly typeOnly: boolean;
  readonly conditional?: true;
  readonly local?: true;
  readonly reference?: true;
};

export type ModuleFact = {
  readonly file: string;
  readonly role: string;
  readonly entry: boolean;
  readonly module?: string | undefined;
  readonly qualifiedUses: unknown;
  readonly publicNames?: readonly string[];
  readonly entryName?: string;
  readonly compositionRoot?: true;
};

export type FactsBundle = {
  readonly modules: ModuleFact[];
  readonly packages: { readonly root: string; readonly published: boolean }[];
  readonly definitions: Readonly<Record<string, unknown>>[];
  readonly imports: ImportRecord[];
  readonly docComments: Readonly<Record<string, unknown>>[];
  readonly nearDuplicateUnits: Readonly<Record<string, unknown>>[];
};

function isScanned(value: unknown): value is Scanned {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type Group = { from: string; to: string; names: NameRef[]; reexport: boolean; role: string };
type BundleOptions = Partial<
  Pick<PackageFacts, 'published' | 'entryPoints'> & {
    django: boolean;
    referenceFiles: readonly string[];
    packageOf: (file: string) => string;
  }
>;
export type BundleInput = BundleOptions & {
  modules: readonly PythonModule[];
  scanned: Scanned;
  isTest: (file: string) => boolean;
};

export function scannedOf(value: unknown): Scanned {
  if (!isScanned(value)) {
    throw new TypeError('The facts scan output is malformed');
  }
  return value;
}

export type FactsReport = Readonly<Partial<FactsBundle>>;

export type FactFindingOptions = {
  readonly exceptions?: readonly ExceptionEntry[];
  readonly baselineMovesFile?: string | undefined;
  readonly layout?: unknown;
};
