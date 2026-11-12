package com.example.settings;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Prints settings as one "key = item, item" line per key. */
public final class SettingsPrinter {
  private SettingsPrinter() {}

  public static void printSettings(String text, Output output) {
    Map<String, List<String>> sorted = new TreeMap<>(SettingsParser.parseSettings(text));
    for (Map.Entry<String, List<String>> entry : sorted.entrySet()) {
      output.write(entry.getKey() + " = " + String.join(", ", entry.getValue()) + "\n");
    }
  }
}
