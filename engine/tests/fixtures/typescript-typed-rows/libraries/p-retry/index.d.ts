export default function pRetry<T>(work: () => Promise<T>, options?: object): Promise<T>;
