const CHECK = /^\[(\w+)\]/u;

export function isClassExempt(diagnostic, exemptions) {
  const check =
    typeof diagnostic.message === 'string' ? CHECK.exec(diagnostic.message)?.[1] : undefined;
  const exempting = check === undefined ? undefined : exemptions[check];
  const annotations = Array.isArray(diagnostic.classAnnotations) ? diagnostic.classAnnotations : [];
  return Array.isArray(exempting) && exempting.some((name) => annotations.includes(name));
}
