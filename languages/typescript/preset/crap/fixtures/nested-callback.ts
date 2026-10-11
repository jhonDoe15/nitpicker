export type Repo = {
  find: (id: string) => string | undefined;
  sleep: (ms: number) => Promise<void>;
  describe: (id: string) => string;
};

export function makeRepo(): Repo {
  const items = new Map<string, string>();
  return {
    find: (id) => items.get(id),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    describe: (id) => `item ${id}`,
  };
}
