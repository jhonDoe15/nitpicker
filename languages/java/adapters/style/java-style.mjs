import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import {
  JAVA_FORMATTER,
  JAVA_FORMATTER_OPTIONS,
  JAVA_FORMATTER_VERSION,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from '../../conventions/java-conventions.mjs';
import { formatterOptionFlags, JAVA_FORMATTERS, javaFormatterCommand } from './jvm-formatters.mjs';

const DEFAULT_JAVA_STYLE = 'google';
const DEFAULT_INDENTATION = '2';
const STYLE_BY_INDENTATION = { 2: 'google', 4: 'aosp' };

export const JAVA_FORMATTER_TOOLS = Object.fromEntries(
  Object.entries(JAVA_FORMATTERS).map(([style, { tool, label }]) => [
    style,
    { tool, label, command: javaFormatterCommand(style) },
  ]),
);

export const NOT_YOUR_JAVA_FORMATTER =
  'Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.';

export function javaStyle(conventions) {
  const formatter = conventions?.[JAVA_FORMATTER] ?? DEFAULT_JAVA_STYLE;
  return formatter === DEFAULT_JAVA_STYLE
    ? (STYLE_BY_INDENTATION[conventions?.[JAVA_INDENTATION_ID]] ?? DEFAULT_JAVA_STYLE)
    : formatter;
}

export function javaLineLength(conventions) {
  return Number(conventions?.[JAVA_LINE_LENGTH_ID] ?? JAVA_LINE_LENGTH);
}

export function checkstyleIndentation(conventions) {
  return conventions?.[JAVA_INDENTATION_ID] ?? DEFAULT_INDENTATION;
}

export function javaFormatterSettings(conventions) {
  const version = conventions?.[JAVA_FORMATTER_VERSION];
  const options = conventions?.[JAVA_FORMATTER_OPTIONS];
  return {
    ...(version === undefined ? {} : { version }),
    ...(options === undefined ? {} : { options }),
  };
}

export function javaFormatterFlags(conventions) {
  return formatterOptionFlags(javaStyle(conventions), javaFormatterSettings(conventions));
}

export function javaStyleProperties({ javaStyle, conventions }) {
  const { version } = javaFormatterSettings(conventions);
  const flags = javaStyle === 'none' ? [] : javaFormatterFlags(conventions);
  return [
    ...(version === undefined || javaStyle === 'none'
      ? []
      : [`-Pnitpicker.java.formatterVersion=${version}`]),
    ...(flags.length === 0 ? [] : [`-Pnitpicker.java.formatterFlags=${flags.join(',')}`]),
    ...(javaStyle === undefined || javaStyle === DEFAULT_JAVA_STYLE
      ? []
      : [`-Pnitpicker.java.style=${javaStyle}`]),
    ...(javaStyle === 'none'
      ? [`-Pnitpicker.java.indentation=${checkstyleIndentation(conventions)}`]
      : []),
  ];
}
