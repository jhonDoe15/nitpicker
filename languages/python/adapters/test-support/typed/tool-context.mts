import { createToolContext as untypedCreateToolContext } from '../../python-tools.mjs';

type JsContext = ReturnType<typeof untypedCreateToolContext>;
export type ToolContext = Omit<JsContext, 'exclude'> & { readonly exclude: readonly string[] };
type JsOptions = Parameters<typeof untypedCreateToolContext>[0];

export type ToolContextOptions = Partial<
  Pick<JsOptions, 'conventions' | 'layout' | 'probes' | 'quick'>
> & {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly exclude?: readonly string[];
  readonly reportRoot?: string | undefined;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly duplicateSkippedFolders?: unknown;
  readonly snapshot?: string;
  readonly baselineRoot?: unknown;
  readonly policyRoot?: string | undefined;
  readonly toolPrecedence?: unknown;
  readonly spawn?: unknown;
  readonly pytestAddopts?: unknown;
  readonly mutationScope?: unknown;
  readonly analyzerDeadlineMs?: unknown;
};

export function createToolContext(options: ToolContextOptions): ToolContext {
  const { exclude = [], ...rest } = options;
  const context = untypedCreateToolContext({
    reportRoot: undefined,
    duplicateSkippedFolders: undefined,
    baselineRoot: undefined,
    policyRoot: undefined,
    toolPrecedence: undefined,
    spawn: undefined,
    pytestAddopts: undefined,
    mutationScope: undefined,
    analyzerDeadlineMs: undefined,
    ...rest,
  });
  return { ...context, exclude };
}
