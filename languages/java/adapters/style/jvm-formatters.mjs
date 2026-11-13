const GOOGLE_FORMAT = {
  tool: 'google-java-format',
  classpath: 'format',
  mainClass: 'com.google.googlejavaformat.java.Main',
  coordinates: (pinned, version = pinned.googleJavaFormat) =>
    `com.google.googlejavaformat:google-java-format:${version}`,
};

export const JAVA_FORMATTERS = {
  google: { ...GOOGLE_FORMAT, label: 'google-java-format', flags: [] },
  aosp: { ...GOOGLE_FORMAT, label: 'google-java-format --aosp', flags: ['--aosp'] },
  palantir: {
    tool: 'palantir-java-format',
    label: 'palantir-java-format',
    classpath: 'format-palantir',
    mainClass: 'com.palantir.javaformat.java.Main',
    flags: ['--palantir'],
    coordinates: (pinned, version = pinned.palantirJavaFormat) =>
      `com.palantir.javaformat:palantir-java-format:${version}`,
  },
};

const SKIP_FLAGS = {
  skipJavadocFormatting: '--skip-javadoc-formatting',
  skipReflowingLongStrings: '--skip-reflowing-long-strings',
};
const GOOGLE_SKIP_FLAGS_FROM = [1, 8];

function atLeast(version, [major, minor]) {
  const [first, second] = version.split('.').map(Number);
  return first > major || (first === major && second >= minor);
}

export function formatterOptionFlags(style, { version, options = [] } = {}) {
  const google = style !== 'palantir';
  if (google && version !== undefined && !atLeast(version, GOOGLE_SKIP_FLAGS_FROM)) {
    return [];
  }
  return options
    .filter((option) => option in SKIP_FLAGS && (google || option === 'skipReflowingLongStrings'))
    .map((option) => SKIP_FLAGS[option]);
}

export function javaFormatterCommand(style) {
  const { tool, flags } = JAVA_FORMATTERS[style];
  return [tool, ...flags, '--replace', '<Java files>'].join(' ');
}

export const KOTLIN_FORMATTERS = {
  ktlint: {
    label: 'ktlint',
    mainClass: 'com.pinterest.ktlint.Main',
    coordinates: (pinned) => `com.pinterest.ktlint:ktlint-cli:${pinned.ktlint}:all`,
  },
  ktfmt: {
    label: 'ktfmt',
    mainClass: 'com.facebook.ktfmt.cli.Main',
    coordinates: (pinned) => `com.facebook:ktfmt:${pinned.ktfmt}:with-dependencies`,
  },
};
