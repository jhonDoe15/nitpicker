const ROOT_FILE = '(?:main|server|composition-root)\\.[cm]?[jt]sx?';
const DEFAULT_COMPOSITION_ROOT_PATTERN = `(?:^|/)(?:main/(?:${ROOT_FILE}|composition-root/.+)|src/${ROOT_FILE})$`;

export const compositionRootOptionsSchema = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
    },
    additionalProperties: false,
  },
];

export function compositionRootRegExp(userPattern) {
  return new RegExp(
    userPattern === undefined
      ? DEFAULT_COMPOSITION_ROOT_PATTERN
      : `(?:${DEFAULT_COMPOSITION_ROOT_PATTERN})|(?:${userPattern})`,
  );
}

export function isCompositionRootFile(context) {
  const filename = context.filename.replaceAll('\\', '/');
  return compositionRootRegExp(context.options[0]?.compositionRootPattern).test(filename);
}
