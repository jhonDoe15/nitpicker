export const SKIP_JAVADOC = 'skipJavadocFormatting';
export const SKIP_REFLOW = 'skipReflowingLongStrings';
export const FORMATTER_VERSION = /^\d+\.\d+(?:\.\d+)?$/u;

const FORMAT_JAVADOC_DEFAULT = { google: true, palantir: false };

function skipsOf(formatter, { formatJavadoc, reflowLongStrings }) {
  return [
    ...((formatJavadoc ?? FORMAT_JAVADOC_DEFAULT[formatter]) ? [] : [SKIP_JAVADOC]),
    ...((reflowLongStrings ?? false) ? [] : [SKIP_REFLOW]),
  ];
}

export function stepFormatterDetails(formatter, { version, formatJavadoc, reflowLongStrings }) {
  return {
    ...(FORMATTER_VERSION.test(version ?? '') ? { version } : {}),
    options: skipsOf(formatter, { formatJavadoc, reflowLongStrings }),
  };
}

export function mergedDetails(group) {
  const found = group.find((entry) => entry.version !== undefined || entry.options !== undefined);
  return {
    ...(found?.version === undefined ? {} : { version: found.version }),
    ...(found?.options === undefined ? {} : { options: found.options }),
  };
}

function signature(entry) {
  return JSON.stringify([entry.version, entry.options]);
}

export function disagree(group) {
  const [first, ...rest] = group.filter((entry) => entry.options !== undefined);
  return first !== undefined && rest.some((entry) => signature(entry) !== signature(first))
    ? first
    : undefined;
}
