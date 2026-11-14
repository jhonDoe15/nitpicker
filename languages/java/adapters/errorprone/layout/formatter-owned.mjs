const OWNED_BY_FORMATTER = new Map([['spring', new Set(['AnnotationPosition'])]]);

export function isFormatterOwned(finding, javaStyle) {
  return OWNED_BY_FORMATTER.get(javaStyle)?.has(finding.rule) === true;
}
