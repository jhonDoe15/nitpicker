type GetterReference = { readonly type: string; readonly getter: string };

export type ChainReads = {
  readonly paths: string[][];
  readonly references: GetterReference[];
};

export type PersistentClass = {
  readonly name: string;
  readonly fields: Map<string, string>;
  readonly getters: string[];
};

export type EntityColumns = {
  readonly readsColumns: (getters: readonly string[]) => boolean;
  readonly isColumnOf: (type: string, getter: string) => boolean;
};
