export const STRINGS = `package shop.util;

public final class Strings {
  public static String trim(String text) {
    return text.strip();
  }
}
`;

export const FACADE = `package shop;

import shop.util.Strings;

final class Facade {
  /** Trims the text. */
  static String trim(String text) {
    return Strings.trim(text);
  }

  String run() {
    return trim(" a ") + Facade.trim(" b ");
  }
}
`;

export const REPORT = `package shop;

class Report {
  String render(String text) {
    return "[" + Facade.trim(text) + "]";
  }

  String clean(String raw) {
    return raw.trim() + " x ".trim();
  }
}
`;

export const FACADE_AFTER = `package shop;

import shop.util.Strings;

final class Facade {
  String run() {
    return Strings.trim(" a ") + Strings.trim(" b ");
  }
}
`;

export const REPORT_AFTER = `package shop;

import shop.util.Strings;

class Report {
  String render(String text) {
    return "[" + Strings.trim(text) + "]";
  }

  String clean(String raw) {
    return raw.trim() + " x ".trim();
  }
}
`;

export const FACADE_PATH = 'src/main/java/shop/Facade.java';
export const REPORT_PATH = 'src/main/java/shop/Report.java';
export const STRINGS_PATH = 'src/main/java/shop/util/Strings.java';
export const RULE = 'pmd/StaticForwardingWrapper';

export function projectOf(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    [STRINGS_PATH]: STRINGS,
    [FACADE_PATH]: FACADE,
    [REPORT_PATH]: REPORT,
    ...extra,
  };
}
