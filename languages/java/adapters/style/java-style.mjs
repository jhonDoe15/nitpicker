export const JAVA_STYLES = ['google', 'aosp'];
const DEFAULT_JAVA_STYLE = 'google';
const INDENTATION_CONVENTION = 'java.indentation';
const STYLE_BY_INDENTATION = { 2: 'google', 4: 'aosp' };

export function javaStyle(conventions) {
  return STYLE_BY_INDENTATION[conventions?.[INDENTATION_CONVENTION]] ?? DEFAULT_JAVA_STYLE;
}

export function javaStyleArguments(conventions) {
  const style = javaStyle(conventions);
  return style === DEFAULT_JAVA_STYLE ? [] : ['--java-style', style];
}

export function javaStyleProperties(style) {
  return style === undefined || style === DEFAULT_JAVA_STYLE
    ? []
    : [`-Pnitpicker.java.style=${style}`];
}
