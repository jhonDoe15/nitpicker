import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import {
  JAVA_FORMATTER,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from '../../conventions/java-conventions.mjs';

const DEFAULT_JAVA_STYLE = 'google';
const STYLE_BY_INDENTATION = { 2: 'google', 4: 'aosp' };

export function javaStyle(conventions) {
  const formatter = conventions?.[JAVA_FORMATTER] ?? DEFAULT_JAVA_STYLE;
  return formatter === DEFAULT_JAVA_STYLE
    ? (STYLE_BY_INDENTATION[conventions?.[JAVA_INDENTATION_ID]] ?? DEFAULT_JAVA_STYLE)
    : formatter;
}

export function javaLineLength(conventions) {
  return Number(conventions?.[JAVA_LINE_LENGTH_ID] ?? JAVA_LINE_LENGTH);
}

export function javaStyleProperties(style) {
  return style === undefined || style === DEFAULT_JAVA_STYLE
    ? []
    : [`-Pnitpicker.java.style=${style}`];
}
