export default class PQueue { constructor(options?: { concurrency?: number }); add<T>(work: () => Promise<T>): Promise<T>; }
