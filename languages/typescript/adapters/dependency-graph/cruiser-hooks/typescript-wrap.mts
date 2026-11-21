type TypeScriptConfig = { readonly options?: Record<string, unknown> } & Record<string, unknown>;
type TranspileOptions = { readonly tsConfig?: TypeScriptConfig } & Record<string, unknown>;
type Wrapper = {
  readonly transpile: (source: string, fileName?: string, options?: TranspileOptions) => string;
} & Record<string, unknown>;

const INPUT_NAME = 'nitpicker-transpile-input';

const originalUrl = new URL(import.meta.url).searchParams.get('original');
const original =
  originalUrl === null
    ? undefined
    : ((await import(originalUrl)) as { default: (flavor?: string) => Wrapper }).default;

function usesJsx(flavor: string | undefined, tsConfig: TypeScriptConfig | undefined): boolean {
  const options = { ...(flavor === 'tsx' ? { jsx: 'react' } : {}), ...tsConfig?.options };
  return Boolean(options.jsx);
}

export function inputFileName(
  source: string,
  flavor: string | undefined,
  tsConfig: TypeScriptConfig | undefined,
): string {
  let name = INPUT_NAME;
  while (source.includes(name)) name = `${name}_`;
  return `${name}${usesJsx(flavor, tsConfig) ? '.tsx' : '.ts'}`;
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

export default function typescriptWrap(flavor?: string): Wrapper {
  if (original === undefined) {
    throw new Error('typescript-wrap replacement loaded without the original module');
  }
  return withInputFileName(original(flavor), flavor);
}
