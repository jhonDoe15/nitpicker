export default class Bottleneck { constructor(options?: { maxConcurrent?: number }); schedule<T>(work: () => Promise<T>): Promise<T>; }
