import type { JSONSchema } from '@typescript-eslint/utils';

export type CompositionRootOptions = readonly [Readonly<Record<string, unknown>>?];
type RootContext = { readonly filename: string; readonly options: readonly unknown[] };

const ROOT_FILE = '(?:main|server|composition-root)\\.[cm]?[jt]sx?';
const DEFAULT_COMPOSITION_ROOT_PATTERN = `(?:^|/)(?:main/(?:${ROOT_FILE}|composition-root/.+)|src/${ROOT_FILE})$`;

export const compositionRootOptionsSchema: JSONSchema.JSONSchema4[] = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
    },
    additionalProperties: false,
  },
];

export function compositionRootRegExp(userPattern: string | undefined): RegExp {
  return new RegExp(
    userPattern === undefined
      ? DEFAULT_COMPOSITION_ROOT_PATTERN
      : `(?:${DEFAULT_COMPOSITION_ROOT_PATTERN})|(?:${userPattern})`,
  );
}

function patternOption(options: readonly unknown[]): string | undefined {
  const [first] = options;
  const pattern: unknown =
    typeof first === 'object' && first !== null
      ? Reflect.get(first, 'compositionRootPattern')
      : undefined;
  return typeof pattern === 'string' ? pattern : undefined;
}

export function isCompositionRootFile(context: RootContext): boolean {
  const filename = context.filename.replaceAll('\\', '/');
  return compositionRootRegExp(patternOption(context.options)).test(filename);
}
