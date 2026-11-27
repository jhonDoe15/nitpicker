export declare class Pool {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}
