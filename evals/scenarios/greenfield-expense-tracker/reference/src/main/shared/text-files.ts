export type TextFiles = {
  readonly readText: (path: string) => Promise<string | undefined>;
  readonly writeText: (path: string, text: string) => Promise<void>;
};
