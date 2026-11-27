export declare function request(url: string): Promise<any>;
export declare class Pool { constructor(url: string); request(o: object): Promise<any>; }
