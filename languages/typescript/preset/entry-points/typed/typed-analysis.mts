import { analyzeEntryPoints as untypedAnalyzeEntryPoints } from '../analyze.mjs';
import type { resolveLayout } from '../../layout.mjs';
import { readLayout as untypedReadLayout } from '../../head-policy.mjs';

export type EntryPointLayout = Omit<ReturnType<typeof resolveLayout>, 'sourceRoot'> & {
  readonly sourceRoot: string;
};

type EntryPointImport = {
  readonly source: string;
  readonly target: string;
  readonly publicEntryPoint?: string;
};

type EntryPointReport = {
  readonly summary: {
    readonly productionModules: number;
    readonly components: number;
    readonly declaredEntryPoints: number;
    readonly throughEntryPoint?: number;
    readonly publicAlternativeBypasses?: number;
    readonly unexportedTargetImports?: number;
    readonly missingEntryPointImports?: number;
    readonly concreteCrossBoundaryImports?: number;
  };
  readonly publicAlternativeBypasses: readonly EntryPointImport[];
  readonly unexportedTargetImports: readonly EntryPointImport[];
  readonly missingEntryPointImports: readonly EntryPointImport[];
};

export const readLayout: () => EntryPointLayout = untypedReadLayout;

export const analyzeEntryPoints: (
  graph: unknown,
  sourceRoot: string,
  options?: {
    readonly layout?: ReturnType<typeof resolveLayout>;
    readonly foundationDirectories?: Set<string>;
  },
) => EntryPointReport = untypedAnalyzeEntryPoints;
