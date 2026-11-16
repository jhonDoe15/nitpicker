export type Libraries = {
  readonly database?: string;
  readonly logging?: string;
  readonly validator?: string;
  readonly validators?: readonly string[];
  readonly pytestStyle?: Readonly<Record<string, unknown>>;
};

export type DetectedLibraries = {
  readonly database: string;
  readonly logging: string;
  readonly validator: string;
  readonly validators: readonly string[];
};

export type PackageTable = {
  readonly name: string;
  readonly packages: readonly string[];
};
