export declare class Model {
  save(): Promise<this>;
  destroy(): Promise<void>;
  get(key: string): unknown;
  static findAll(options?: object): Promise<any[]>;
}
export type BelongsToGetAssociationMixin<T> = (options?: object) => Promise<T | null>;
export declare class Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  afterCommit(hook: () => unknown): void;
}
export declare class Sequelize {
  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
  transaction(): Promise<Transaction>;
}
