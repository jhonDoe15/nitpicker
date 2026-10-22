import { JAVA_LINE_LENGTH } from '../../../../shared/project-rules/size-rules.mjs';
import {
  JAVA_FORMATTER,
  JAVA_INDENTATION_ID,
  JAVA_LINE_LENGTH_ID,
} from '../../conventions/java-conventions.mjs';

const DEFAULT_JAVA_STYLE = 'google';
const DEFAULT_INDENTATION = '2';
const STYLE_BY_INDENTATION = { 2: 'google', 4: 'aosp' };

export const JAVA_FORMATTER_TOOLS = {
  google: {
    tool: 'google-java-format',
    label: 'google-java-format',
    command: 'google-java-format --replace <Java files>',
  },
  aosp: {
    tool: 'google-java-format',
    label: 'google-java-format --aosp',
    command: 'google-java-format --aosp --replace <Java files>',
  },
  palantir: {
    tool: 'palantir-java-format',
    label: 'palantir-java-format',
    command: 'palantir-java-format --palantir --replace <Java files>',
  },
};

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
