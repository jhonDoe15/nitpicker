const GOOGLE_FORMAT = {
  tool: 'google-java-format',
  classpath: 'format',
  mainClass: 'com.google.googlejavaformat.java.Main',
  coordinates: (pinned) =>
    `com.google.googlejavaformat:google-java-format:${pinned.googleJavaFormat}`,
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
    coordinates: (pinned) =>
      `com.palantir.javaformat:palantir-java-format:${pinned.palantirJavaFormat}`,
  },
};

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
