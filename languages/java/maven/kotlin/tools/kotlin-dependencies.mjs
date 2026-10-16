const FAT_JAR = ['*'];

export const KOTLIN_COMPILER_TOOL = 'kotlin-compiler';
export const DETEKT_TOOL = 'detekt';
export const DETEKT_STDLIB_TOOL = 'detekt-stdlib';

const FORMATTER_TOOLS = {
  ktlint: (pinned) => ({
    name: 'ktlint',
    coordinates: [`com.pinterest.ktlint:ktlint-cli:${pinned.ktlint}:all`],
    exclusions: FAT_JAR,
  }),
  ktfmt: (pinned) => ({
    name: 'ktfmt',
    coordinates: [`com.facebook:ktfmt:${pinned.ktfmt}:with-dependencies`],
    exclusions: FAT_JAR,
  }),
};

export function kotlinTools(pinned, formatter) {
  return [
    {
      name: KOTLIN_COMPILER_TOOL,
      coordinates: [`org.jetbrains.kotlin:kotlin-compiler-embeddable:${pinned.kotlinCompiler}`],
    },
    {
      name: DETEKT_TOOL,
      coordinates: [`io.gitlab.arturbosch.detekt:detekt-cli:${pinned.detekt}:all`],
      exclusions: FAT_JAR,
    },
    {
      name: DETEKT_STDLIB_TOOL,
      coordinates: [`org.jetbrains.kotlin:kotlin-stdlib:${pinned.detektKotlin}`],
      exclusions: FAT_JAR,
    },
    ...(FORMATTER_TOOLS[formatter] === undefined ? [] : [FORMATTER_TOOLS[formatter](pinned)]),
  ];
}
