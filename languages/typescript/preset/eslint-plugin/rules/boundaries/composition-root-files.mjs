const DEFAULT_COMPOSITION_ROOT_PATTERN = '(?:^|/)(?:main|server|composition-root)\\.ts$';

export const compositionRootOptionsSchema = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
    },
    additionalProperties: false,
  },
];

export function isCompositionRootFile(context) {
  const filename = context.filename.replaceAll('\\', '/');
  const userPattern = context.options[0]?.compositionRootPattern;
  return new RegExp(
    userPattern === undefined
      ? DEFAULT_COMPOSITION_ROOT_PATTERN
      : `(?:${DEFAULT_COMPOSITION_ROOT_PATTERN})|(?:${userPattern})`,
  ).test(filename);
}
