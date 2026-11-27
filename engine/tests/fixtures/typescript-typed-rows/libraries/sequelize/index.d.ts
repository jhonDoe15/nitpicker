export declare class Model {
  static findAll<M extends Model>(this: new () => M, options?: object): Promise<M[]>;
  static findOne<M extends Model>(this: new () => M, options?: object): Promise<M | null>;
  static count(options?: object): Promise<number>;
}
export declare class Sequelize {
  constructor(...args: unknown[]);
}
