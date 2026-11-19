import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import {
  JAVA_FORMATTER,
  JAVA_FORMATTER_OPTIONS,
  JAVA_FORMATTER_VERSION,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from '../../conventions/java-conventions.mts';
import { formatterOptionFlags, JAVA_FORMATTERS } from './jvm-formatters.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type FormatterTool = { readonly tool: string; readonly label: string };
type FormatterVersion = { readonly version?: string; readonly options?: readonly string[] };

const DEFAULT_JAVA_STYLE = 'google';
const DEFAULT_INDENTATION = '2';
const STYLE_BY_INDENTATION: Readonly<Record<string, string>> = { 2: 'google', 4: 'aosp' };

export const JAVA_FORMATTER_TOOLS: Readonly<Record<string, FormatterTool>> & {
  readonly google: FormatterTool;
} = {
  ...Object.fromEntries(
    Object.entries(JAVA_FORMATTERS).map(([style, { tool, label }]) => [style, { tool, label }]),
  ),
  google: { tool: JAVA_FORMATTERS.google.tool, label: JAVA_FORMATTERS.google.label },
};

export const NOT_YOUR_JAVA_FORMATTER =
  'Not your formatter: pin "conventions.java.formatter" to "google", "palantir", "spring" or "none" in nitpicker.config.json.';

export function javaStyle(conventions: unknown): string {
  const formatter = fieldOf(conventions, JAVA_FORMATTER) ?? DEFAULT_JAVA_STYLE;
  return formatter === DEFAULT_JAVA_STYLE
    ? (STYLE_BY_INDENTATION[String(fieldOf(conventions, JAVA_INDENTATION_ID))] ??
        DEFAULT_JAVA_STYLE)
    : textOf(formatter);
}

export function javaLineLength(conventions: unknown): number {
  return Number(fieldOf(conventions, JAVA_LINE_LENGTH_ID) ?? JAVA_LINE_LENGTH);
}

export function checkstyleIndentation(conventions: unknown): string {
  return textOf(fieldOf(conventions, JAVA_INDENTATION_ID) ?? DEFAULT_INDENTATION);
}

export function javaFormatterSettings(conventions: unknown): FormatterVersion {
  const version = fieldOf(conventions, JAVA_FORMATTER_VERSION);
  const options = fieldOf(conventions, JAVA_FORMATTER_OPTIONS);
  return {
    ...(version === undefined ? {} : { version: textOf(version) }),
    ...(options === undefined ? {} : { options: textsOf(options) }),
  };
}

export function javaFormatterFlags(conventions: unknown): string[] {
  return formatterOptionFlags(javaStyle(conventions), javaFormatterSettings(conventions));
}

export function javaStyleProperties({
  javaStyle,
  conventions,
}: {
  javaStyle: unknown;
  conventions: unknown;
}): string[] {
  const { version } = javaFormatterSettings(conventions);
  const flags = javaStyle === 'none' ? [] : javaFormatterFlags(conventions);
  return [
    ...(version === undefined || javaStyle === 'none'
      ? []
      : [`-Pnitpicker.java.formatterVersion=${version}`]),
    ...(flags.length === 0 ? [] : [`-Pnitpicker.java.formatterFlags=${flags.join(',')}`]),
    ...(javaStyle === undefined || javaStyle === DEFAULT_JAVA_STYLE
      ? []
      : [`-Pnitpicker.java.style=${textOf(javaStyle)}`]),
    ...(javaStyle === 'none'
      ? [`-Pnitpicker.java.indentation=${checkstyleIndentation(conventions)}`]
      : []),
  ];
}
