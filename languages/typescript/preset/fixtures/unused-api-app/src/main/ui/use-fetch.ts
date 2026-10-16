export type FetchOptions = { retries?: number; timeout?: number };

export function useFetch(url: string, options: FetchOptions = {}) {
  return { url, attempts: options.retries ?? 1 };
}
