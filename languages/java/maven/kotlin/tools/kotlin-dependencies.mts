export type KotlinPinned = {
  readonly ktlint: string;
  readonly ktfmt: string;
  readonly kotlinCompiler: string;
  readonly detekt: string;
  readonly detektKotlin: string;
};
type KotlinTool = {
  readonly name: string;
  readonly coordinates: string[];
  readonly exclusions?: string[];
};

const FAT_JAR = ['*'];

const KOTLIN_COMPILER_TOOL = 'kotlin-compiler';
const DETEKT_TOOL = 'detekt';
const DETEKT_STDLIB_TOOL = 'detekt-stdlib';

const FORMATTER_TOOLS: Readonly<
  Record<string, ((pinned: KotlinPinned) => KotlinTool) | undefined>
> = {
  ktlint: (pinned: KotlinPinned): KotlinTool => ({
    name: 'ktlint',
    coordinates: [`com.pinterest.ktlint:ktlint-cli:${pinned.ktlint}:all`],
    exclusions: FAT_JAR,
  }),
  ktfmt: (pinned: KotlinPinned): KotlinTool => ({
    name: 'ktfmt',
    coordinates: [`com.facebook:ktfmt:${pinned.ktfmt}:with-dependencies`],
    exclusions: FAT_JAR,
  }),
};

export function kotlinTools(pinned: KotlinPinned, formatter: string): KotlinTool[] {
  const formatterTool = FORMATTER_TOOLS[formatter];
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
    ...(formatterTool === undefined ? [] : [formatterTool(pinned)]),
  ];
}
