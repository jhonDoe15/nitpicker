export type ColumnName = string | undefined;

export type ForeignKeyFact = {
  readonly table: string | undefined;
  readonly columns: readonly ColumnName[];
  readonly at: number;
};

export type NamedForeignKey = ForeignKeyFact & { readonly table: string };

export type IndexFact = {
  readonly table: string | undefined;
  readonly columns: ColumnName[];
};

export type SchemaFacts = { readonly foreignKeys: ForeignKeyFact[]; readonly indexes: IndexFact[] };

export type SchemaEntry = {
  readonly file: string;
  readonly declared: boolean;
  readonly mysql: boolean;
};

export type MigrationSchema = {
  readonly file: string;
  readonly text: string;
  readonly declared: boolean;
  readonly schema: SchemaFacts;
};

export type PrismaRelation = {
  readonly file: string;
  readonly model: string;
  readonly field: string;
  readonly columns: readonly string[];
  readonly line: number;
};
