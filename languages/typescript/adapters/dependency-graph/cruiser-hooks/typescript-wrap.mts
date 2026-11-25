type TypeScriptConfig = { readonly options?: Record<string, unknown> } & Record<string, unknown>;
type TranspileOptions = { readonly tsConfig?: TypeScriptConfig } & Record<string, unknown>;
type Wrapper = {
  readonly transpile: (source: string, fileName?: string, options?: TranspileOptions) => string;
} & Record<string, unknown>;

const INPUT_NAME = 'nitpicker-transpile-input';

function usesJsx(flavor: string | undefined, tsConfig: TypeScriptConfig | undefined): boolean {
  const options = { ...(flavor === 'tsx' ? { jsx: 'react' } : {}), ...tsConfig?.options };
  return Boolean(options.jsx);
}

const INPUT_NAME_USES = new RegExp(`${INPUT_NAME}(_*)`, 'gu');

function freeName(source: string): string {
  const runs = Array.from(
    source.matchAll(INPUT_NAME_USES),
    ([, underscores]) => underscores?.length ?? 0,
  );
  return runs.length === 0
    ? INPUT_NAME
    : `${INPUT_NAME}${'_'.repeat(runs.reduce((longest, run) => Math.max(longest, run), 0) + 1)}`;
}

export function inputFileName(
  source: string,
  flavor: string | undefined,
  tsConfig: TypeScriptConfig | undefined,
): string {
  return `${freeName(source)}${usesJsx(flavor, tsConfig) ? '.tsx' : '.ts'}`;
}

export function withInputFileName(wrapper: Wrapper, flavor: string | undefined): Wrapper {
  return {
    ...wrapper,
    transpile: (source, fileName, options = {}) =>
      wrapper.transpile(source, fileName, {
        ...options,
        tsConfig: {
          ...options.tsConfig,
          fileName: inputFileName(source, flavor, options.tsConfig),
        },
      }),
  };
}
