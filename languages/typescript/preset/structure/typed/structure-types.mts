import type { Layout } from '../../../adapters/typed/head-policy.mts';

export type StructureLayout = Layout & {
  isTestFixture(file: string): boolean;
  readonly sourceRoot: string;
};

export type StructurePolicy = {
  readonly exceptions: readonly unknown[];
  readonly thresholds: { readonly folderDepth?: number | undefined };
  readonly preset?: string | undefined;
  readonly layout?: Readonly<Record<string, unknown>>;
};

export type SizedFile = { readonly path: string; readonly kind: 'test' | 'source' };

export type StoryComponent = {
  readonly name: string;
  readonly line: number;
};
