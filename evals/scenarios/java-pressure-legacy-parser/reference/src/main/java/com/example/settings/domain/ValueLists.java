package com.example.settings.domain;

import java.util.ArrayList;
import java.util.List;

/** Splits the value of a settings line into its items, honoring double quotes. */
public final class ValueLists {
  private ValueLists() {}

  /**
   * Splits a trimmed value.
   *
   * @param raw the text after the equals sign, without surrounding spaces
   * @param lineNumber the number of the line, counted from 1, for error messages
   * @return the items; an empty value has none
   */
  public static List<String> split(String raw, int lineNumber) {
    List<String> items = new ArrayList<>();
    if (raw.isEmpty()) {
      return items;
    }
    ValueScanner scanner = new ValueScanner(raw, lineNumber);
    do {
      items.add(scanner.nextItem());
    } while (scanner.consumeSeparator());
    return items;
  }
}
