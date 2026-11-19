export type SarifResult = {
  readonly ruleId?: string;
  readonly message?: { readonly text?: string; readonly arguments?: readonly unknown[] };
  readonly locations?: readonly {
    readonly logicalLocations?: readonly { readonly fullyQualifiedName?: string }[];
    readonly physicalLocation?: {
      readonly artifactLocation?: { readonly uri?: string };
      readonly region?: unknown;
    };
  }[];
  readonly [field: string]: unknown;
};

export type SarifRun = {
  readonly results?: readonly SarifResult[];
  readonly [field: string]: unknown;
};

export type SarifLog = { readonly runs?: readonly SarifRun[]; readonly [field: string]: unknown };

export type SourceIndex = Map<string, string[]>;

export type JpaFilterOptions = {
  readonly projectRoot: string;
  readonly sourceRoots?: readonly string[] | undefined;
  readonly checks?: ((file: string) => boolean) | undefined;
};
