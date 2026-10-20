const INLINE_CHECKSTYLE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressWithPlainTextCommentFilter',
  'SuppressionXpathFilter',
];
const RELAXED_NAME = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';
const RELAXED_NAME_MODULES = ['MemberName', 'MethodName'];

function withRelaxedName(text, name) {
  const pattern = new RegExp(
    `(<module name="${name}">\\s*<property name="format" value=")[^"]*(")`,
    'u',
  );
  if (!pattern.test(text)) {
    throw new Error(`nitpicker could not find ${name} in google_checks.xml`);
  }
  return text.replace(pattern, (whole, head, tail) => `${head}${RELAXED_NAME}${tail}`);
}

export function nitpickerCheckstyleConfig(bundled) {
  const text = INLINE_CHECKSTYLE_FILTERS.reduce(
    (current, name) =>
      current.replaceAll(
        new RegExp(`<module name="${name}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu'),
        '',
      ),
    bundled,
  );
  const left = INLINE_CHECKSTYLE_FILTERS.filter((name) => text.includes(`"${name}"`));
  if (left.length > 0) {
    throw new Error(`nitpicker could not remove ${left.join(', ')} from google_checks.xml`);
  }
  return RELAXED_NAME_MODULES.reduce(withRelaxedName, text);
}
