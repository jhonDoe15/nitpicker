package com.example.settings;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Prints settings as one "key = item, item" line per key. */
public final class SettingsPrinter {
  private SettingsPrinter() {}

  public static void printSettings(String text, Output output) {
    settingLines(SettingsParser.parseSettings(text)).forEach(output::write);
  }

  public static void printResolved(String entry, Map<String, String> sources, Output output) {
    linesOf(SettingsResolver.resolveSettings(entry, sources)).forEach(output::write);
  }

  private static List<String> linesOf(Resolution resolution) {
    return switch (resolution) {
      case Resolution.Resolved(Map<String, List<String>> settings) -> settingLines(settings);
      case Resolution.MissingSource(String name) -> List.of("Missing source " + name + "\n");
      case Resolution.IncludeCycle(List<String> chain) ->
          List.of("Include cycle: " + String.join(" -> ", chain) + "\n");
      case Resolution.EmptyInclude(String source) -> List.of("Empty include in " + source + "\n");
    };
  }

  private static List<String> settingLines(Map<String, List<String>> settings) {
    return new TreeMap<>(settings)
        .entrySet().stream()
            .map(entry -> entry.getKey() + " = " + String.join(", ", entry.getValue()) + "\n")
            .toList();
  }
}
