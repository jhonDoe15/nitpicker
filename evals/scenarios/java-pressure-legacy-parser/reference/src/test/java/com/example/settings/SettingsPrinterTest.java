package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsPrinterTest {
  private static List<String> resolvedLines(String entry, Map<String, String> sources) {
    List<String> written = new ArrayList<>();
    SettingsPrinter.printResolved(entry, sources, written::add);
    return written;
  }

  @Test
  void writesOneLinePerKeyInKeyOrder() {
    List<String> written = new ArrayList<>();

    SettingsPrinter.printSettings("b = 2, 3\na = 1", written::add);

    assertEquals(List.of("a = 1\n", "b = 2, 3\n"), written);
  }

  @Test
  void writesNothingForNoSettings() {
    List<String> written = new ArrayList<>();

    SettingsPrinter.printSettings("# nothing here\n", written::add);

    assertEquals(List.of(), written);
  }

  @Test
  void writesResolvedSettingsLikePrintSettings() {
    Map<String, String> sources =
        Map.of("main", "include = base\nb = 2, 3", "base", "a = \"1, 1\"");

    assertEquals(List.of("a = 1, 1\n", "b = 2, 3\n"), resolvedLines("main", sources));
  }

  @Test
  void writesOneLineForEachKindOfFailure() {
    assertEquals(List.of("Missing source main\n"), resolvedLines("main", Map.of()));
    assertEquals(
        List.of("Include cycle: a -> b -> a\n"),
        resolvedLines("a", Map.of("a", "include = b", "b", "include = a")));
    assertEquals(List.of("Empty include in a\n"), resolvedLines("a", Map.of("a", "include =")));
  }
}
