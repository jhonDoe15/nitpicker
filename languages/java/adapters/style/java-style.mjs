import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import {
  JAVA_FORMATTER,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from '../../conventions/java-conventions.mjs';
import { JAVA_FORMATTERS, javaFormatterCommand } from './jvm-formatters.mjs';

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

export function javaStyleProperties({ javaStyle, conventions }) {
  return [
    ...(javaStyle === undefined || javaStyle === DEFAULT_JAVA_STYLE
      ? []
      : [`-Pnitpicker.java.style=${javaStyle}`]),
    ...(javaStyle === 'none'
      ? [`-Pnitpicker.java.indentation=${checkstyleIndentation(conventions)}`]
      : []),
  ];
}
