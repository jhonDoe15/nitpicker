const INLINE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressionXpathFilter',
];
const LOWER_CAMEL_NAME = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';

export function nitpickerCheckstyleConfig(text) {
  const withoutFilters = INLINE_FILTERS.reduce(
    (current, name) =>
      current.replace(new RegExp(`<module name="${name}"\\s*(?:/>|>.*?</module>)`, 'gs'), ''),
    text,
  );
  const left = INLINE_FILTERS.filter((name) => withoutFilters.includes(`"${name}"`));
  if (left.length > 0) {
    throw new Error(`nitpicker could not remove ${left.join(', ')} from google_checks.xml`);
  }
  return ['MemberName', 'MethodName'].reduce((current, name) => {
    const pattern = new RegExp(
      `(<module name="${name}">\\s*<property name="format" value=")[^"]*(")`,
      's',
    );
    if (!pattern.test(current)) {
      throw new Error(`nitpicker could not find ${name} in google_checks.xml`);
    }
    return current.replace(
      pattern,
      (_whole, before, after) => `${before}${LOWER_CAMEL_NAME}${after}`,
    );
  }, withoutFilters);
}

export function checkstyleProperties(suppressions) {
  return `org.checkstyle.google.suppressionfilter.config=${suppressions.replaceAll('\\', '\\\\')}\n`;
}
