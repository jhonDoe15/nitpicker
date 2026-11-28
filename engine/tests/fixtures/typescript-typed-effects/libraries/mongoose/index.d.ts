export interface Query<T> {
  where(path: string): Query<T>;
  equals(value: unknown): Query<T>;
  exec(): Promise<T>;
  then<R>(done: (value: T) => R): Promise<R>;
}
export interface Model<T> { find(filter?: object): Query<T[]>; }
export declare function model<T>(name: string): Model<T>;
