declare class Redis {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
}
export default Redis;
