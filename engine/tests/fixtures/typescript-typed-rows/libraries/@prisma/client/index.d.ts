type User = { id: string; email: string; name: string | null };
type Link = { userId: string; groupId: string };
type Untyped = any;
type Args = {
  where?: object; select?: object; include?: object; omit?: object; orderBy?: object;
  take?: number; skip?: number; cursor?: object; distinct?: string[];
};
type Delegate = {
  findFirst(args?: Args): Promise<User | null>;
  findUnique(args: Args): Promise<User | null>;
  findMany(args?: Args): Promise<User[]>;
  count(args?: Args): Promise<number>;
};
type LinkDelegate = {
  findFirst(args?: Args): Promise<Link | null>;
  findUnique(args: Args): Promise<Link | null>;
};
type LooseDelegate = { findFirst(args?: Args): Promise<Untyped> };
export declare class PrismaClient {
  constructor(options?: object);
  user: Delegate;
  order: Delegate;
  link: LinkDelegate;
  loose: LooseDelegate;
  $extends(extension: object): PrismaClient;
}
