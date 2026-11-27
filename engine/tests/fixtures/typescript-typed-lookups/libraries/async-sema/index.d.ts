export declare class Sema { constructor(n: number); acquire(): Promise<void>; release(): void; }
export declare function RateLimit(n: number): () => Promise<void>;
