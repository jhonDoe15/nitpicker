import { readHeadPolicyFile as untypedReadHeadPolicyFile } from '../../../../../../shared/head-policy.mjs';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../../head-policy.mjs';

export type PluginLayout = {
  readonly extensions: readonly string[];
  readonly sourceGlobs: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly testGlobs: readonly string[];
  readonly testRoots: readonly string[];
  readonly isEndToEndTest: (file: string) => boolean;
  readonly isExcluded: (file: string) => boolean;
  readonly isFixturePath: (file: string) => boolean;
  readonly isGeneratedPath: (file: string) => boolean;
  readonly isRunnableTestFile: (file: string) => boolean;
  readonly isRunnerTestFile: (file: string) => boolean;
  readonly isSourceFile: (file: string) => boolean;
  readonly isTestFile: (file: string) => boolean;
  readonly isTestPath: (file: string) => boolean;
  readonly isTestFixture: (file: string, name?: string) => boolean;
  readonly sourceRootOf: (file: string) => string | undefined;
};

export type LibraryChoices = Readonly<Record<string, unknown>>;

export type PluginHeadPolicy = { readonly libraries: LibraryChoices };

export const readLayout: () => PluginLayout = untypedReadLayout;

export const readHeadPolicy: () => PluginHeadPolicy = untypedReadHeadPolicy;

export const readHeadPolicyFile: () => Readonly<Record<string, unknown>> =
  untypedReadHeadPolicyFile;
