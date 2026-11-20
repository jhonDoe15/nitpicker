export const NAMES = `package shop;

final class Names {
  String run() {
    return legacy("a") + Names.legacy("b");
  }

  /** @deprecated use {@link #format}. */
  @Deprecated
  static String legacy(String text) {
    return format(text);
  }

  static String format(String text) {
    return "<" + text + ">";
  }
}
`;

export const NAMES_AFTER = `package shop;

final class Names {
  String run() {
    return format("a") + Names.format("b");
  }

  static String format(String text) {
    return "<" + text + ">";
  }
}
`;

export const CALLER = `package shop;

class Caller {
  String call(String text) {
    return Names.legacy(text);
  }
}
`;

export const CALLER_AFTER = CALLER.replace('Names.legacy', 'Names.format');

export const NAMES_PATH = 'src/main/java/shop/Names.java';
export const CALLER_PATH = 'src/main/java/shop/Caller.java';
export const RULE = 'pmd/CompatibilityShim';

export function projectOf(
  names: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return { [NAMES_PATH]: names, [CALLER_PATH]: CALLER, ...extra };
}
