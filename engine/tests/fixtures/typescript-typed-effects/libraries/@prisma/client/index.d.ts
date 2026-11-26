type Row = { id: string };
type Delegate = {
  findUnique(args: object): Promise<Row | null>;
  findMany(args?: object): Promise<Row[]>;
  create(args: object): Promise<Row>;
  createMany(args: object): Promise<{ count: number }>;
  update(args: object): Promise<Row>;
};
export declare class PrismaClient {
  user: Delegate;
  order: Delegate;
  $transaction<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}
