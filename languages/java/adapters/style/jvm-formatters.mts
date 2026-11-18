type Pinned = Readonly<Record<string, string>>;
type JavaFormatter = {
  readonly tool: string;
  readonly label: string;
  readonly classpath: string;
  readonly mainClass: string;
  readonly flags: readonly string[];
  readonly coordinates: (pinned: Pinned, version?: string) => string;
};
type KotlinFormatter = {
  readonly label: string;
  readonly mainClass: string;
  readonly coordinates: (pinned: Pinned) => string;
};
type FormatterSettings = {
  readonly version?: string | undefined;
  readonly options?: readonly string[];
};

const GOOGLE_FORMAT = {
  tool: 'google-java-format',
  classpath: 'format',
  mainClass: 'com.google.googlejavaformat.java.Main',
  coordinates: (pinned: Pinned, version: string = pinned['googleJavaFormat'] ?? '') =>
    `com.google.googlejavaformat:google-java-format:${version}`,
};

export const JAVA_FORMATTERS: Readonly<Record<string, JavaFormatter>> & {
  readonly google: JavaFormatter;
  readonly aosp: JavaFormatter;
  readonly palantir: JavaFormatter;
} = {
  google: { ...GOOGLE_FORMAT, label: 'google-java-format', flags: [] },
  aosp: { ...GOOGLE_FORMAT, label: 'google-java-format --aosp', flags: ['--aosp'] },
  palantir: {
    tool: 'palantir-java-format',
    label: 'palantir-java-format',
    classpath: 'format-palantir',
    mainClass: 'com.palantir.javaformat.java.Main',
    flags: ['--palantir'],
    coordinates: (pinned: Pinned, version: string = pinned['palantirJavaFormat'] ?? '') =>
      `com.palantir.javaformat:palantir-java-format:${version}`,
  },
};

const SKIP_FLAGS: Readonly<Record<string, string>> = {
  skipJavadocFormatting: '--skip-javadoc-formatting',
  skipReflowingLongStrings: '--skip-reflowing-long-strings',
};
const GOOGLE_SKIP_FLAGS_FROM: readonly [number, number] = [1, 8];

function atLeast(version: string, [major, minor]: readonly [number, number]): boolean {
  const [first = 0, second = 0] = version.split('.').map(Number);
  return first > major || (first === major && second >= minor);
}

export function formatterOptionFlags(
  style: string,
  { version, options = [] }: FormatterSettings = {},
): string[] {
  const google = style !== 'palantir';
  if (google && version !== undefined && !atLeast(version, GOOGLE_SKIP_FLAGS_FROM)) {
    return [];
  }
  return options.flatMap((option) => {
    const flag = SKIP_FLAGS[option];
    return flag !== undefined && (google || option === 'skipReflowingLongStrings') ? [flag] : [];
  });
}

export const KOTLIN_FORMATTERS: Readonly<Record<string, KotlinFormatter>> = {
  ktlint: {
    label: 'ktlint',
    mainClass: 'com.pinterest.ktlint.Main',
    coordinates: (pinned) => `com.pinterest.ktlint:ktlint-cli:${pinned['ktlint'] ?? ''}:all`,
  },
  ktfmt: {
    label: 'ktfmt',
    mainClass: 'com.facebook.ktfmt.cli.Main',
    coordinates: (pinned) => `com.facebook:ktfmt:${pinned['ktfmt'] ?? ''}:with-dependencies`,
  },
};
