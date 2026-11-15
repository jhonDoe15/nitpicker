import type { AsyncLocalStorage } from 'node:async_hooks';

export type Place = { readonly file: string; readonly test: string };

type Titled = {
  readonly titlePath?: (() => string[]) | undefined;
  readonly fullTitle: () => string;
};

export type MochaTest = Titled & { readonly file?: unknown };

export type MochaSuite = Titled & {
  readonly file?: unknown;
  readonly root: boolean;
  readonly _beforeEach?: readonly unknown[] | undefined;
  readonly _afterEach?: readonly unknown[] | undefined;
  on(event: 'pre-require', listener: (context: unknown, file: unknown) => void): void;
  on(event: 'post-require', listener: () => void): void;
  on(event: 'beforeAll' | 'afterAll', listener: (hook: MochaHook) => void): void;
};

export type MochaHook = Titled & {
  readonly file?: unknown;
  readonly parent?: MochaSuite | undefined;
  readonly ctx?: { readonly currentTest?: MochaTest | undefined } | undefined;
};

export type MochaRunner = {
  on(event: 'hook', listener: (hook: MochaHook) => void): void;
  on(event: 'test', listener: (test: MochaTest) => void): void;
  prependListener(event: 'end', listener: () => void): void;
};

export type MochaClass = {
  readonly prototype: object;
  readonly Runner: { readonly prototype: object };
};

export type Tracking = {
  readonly storage: AsyncLocalStorage<Place>;
  readonly state: { current: Place; loading: string };
  readonly loadedHookFiles: WeakMap<MochaHook, string>;
  readonly loadedFileCounts: WeakMap<MochaSuite, number>;
  readonly watched: WeakSet<object>;
};
