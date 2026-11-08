package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsParserTest {
  private static void assertRejected(String message, String text) {
    IllegalArgumentException thrown =
        assertThrows(IllegalArgumentException.class, () -> SettingsParser.parseSettings(text));
    assertEquals(message, thrown.getMessage());
  }

  @Test
  void readsKeyValueLines() {
    assertEquals(
        Map.of("name", List.of("Ada"), "lang", List.of("en")),
        SettingsParser.parseSettings("name = Ada\nlang=en"));
  }

  @Test
  void splitsValueOnCommasAndTrimsEveryItem() {
    assertEquals(
        Map.of("tags", List.of("red", "green", "blue")),
        SettingsParser.parseSettings("tags =  red ,green,  blue  "));
  }

  @Test
  void readsEmptyValueAsEmptyList() {
    assertEquals(Map.of("tags", List.of()), SettingsParser.parseSettings("tags ="));
  }

  @Test
  void keepsTheEmptyItemsBetweenAndAfterCommas() {
    assertEquals(
        Map.of("tags", List.of("a", "", "b", "")), SettingsParser.parseSettings("tags = a,,b,"));
  }

  @Test
  void skipsBlankLinesAndCommentLines() {
    assertEquals(
        Map.of("name", List.of("Ada")),
        SettingsParser.parseSettings("# header\n\n  # indented\nname = Ada\n"));
  }

  @Test
  void letsLaterLineReplaceEarlierOne() {
    assertEquals(
        Map.of("name", List.of("Grace")), SettingsParser.parseSettings("name = Ada\nname = Grace"));
  }

  @Test
  void appendsToTheListOfAnEarlierLineWithKeyPlus() {
    assertEquals(
        Map.of("paths", List.of("a", "b", "c")),
        SettingsParser.parseSettings("paths = a\npaths+ = b, c"));
  }

  @Test
  void startsTheListWhenKeyPlusComesFirst() {
    assertEquals(Map.of("paths", List.of("b")), SettingsParser.parseSettings("paths + = b"));
  }

  @Test
  void keepsQuoteCharactersThatDoNotStartAnItem() {
    assertEquals(
        Map.of("motto", List.of("say \"hi\"", "it's")),
        SettingsParser.parseSettings("motto = say \"hi\", it's"));
  }

  @Test
  void rejectsLineWithoutEquals() {
    assertRejected("Line 2: expected key=value", "name = Ada\nlang");
  }

  @Test
  void rejectsMissingKey() {
    assertRejected("Line 1: missing key", " = x");
    assertRejected("Line 1: missing key", "+ = x");
  }

  @Test
  void rejectsKeyWithCharacterOutsideLettersDigitsUnderscoreDotAndDash() {
    assertRejected("Line 2: invalid key b c", "# keys\nb c = x");
  }
}
