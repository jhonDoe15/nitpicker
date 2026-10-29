package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SettingsPrinterTest {
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
}
