export type Binding = {
  readonly specifier: string;
  readonly imported: string;
  readonly members?: readonly string[];
};

export type ImportFact = {
  readonly specifier: string;
  readonly defaultName?: string | undefined;
  readonly namespaceName?: string | undefined;
  readonly named: readonly { readonly local: string; readonly imported: string }[];
};

export type Alias = { readonly local: string; readonly exported: string };

export type ModuleExports = {
  readonly aliases: readonly Alias[];
  readonly locals: readonly Alias[];
  readonly namespaces: readonly { readonly specifier: string; readonly name: string }[];
  readonly reexports: readonly {
    readonly specifier: string;
    readonly star: boolean;
    readonly names: readonly { readonly imported: string; readonly exported: string }[];
  }[];
};

export type StarLink = {
  readonly star: true;
  readonly exported?: undefined;
  readonly imported?: undefined;
  readonly namespace?: undefined;
  readonly viaImport?: undefined;
};

export type NamedLink = {
  readonly star?: undefined;
  readonly exported: string;
  readonly imported: string;
  readonly namespace?: true;
  readonly viaImport?: true;
};

export type GraphLink = (StarLink | NamedLink) & { readonly source: string };

export type Link = (StarLink | NamedLink) & { readonly specifier: string };

export type Resolved<T> = T & { readonly source: string };

export type ModuleFacts = {
  readonly edges: readonly Link[];
  readonly references: readonly Binding[];
};

export type ResolvedModule = {
  readonly edges: readonly GraphLink[];
  readonly references: readonly Resolved<Binding>[];
};

export type GraphNode = {
  readonly file: string;
  readonly name: string;
  readonly viaImport: boolean;
  readonly members?: readonly string[];
};

export type Chain = {
  readonly hostFile: string;
  readonly hostName: string | undefined;
  readonly node: GraphNode;
};

export type Reference = {
  readonly source: string;
  readonly imported: string;
  readonly members?: readonly string[];
};

export type Expansion = { readonly isDeclaration: boolean; readonly next: readonly GraphNode[] };
