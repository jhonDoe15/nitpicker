package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsParserTest {
  private static final String TAGS = "tags";

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
        Map.of(TAGS, List.of("red", "green", "blue")),
        SettingsParser.parseSettings("tags =  red ,green,  blue  "));
  }

  @Test
  void readsEmptyValueAsEmptyList() {
    assertEquals(Map.of(TAGS, List.of()), SettingsParser.parseSettings("tags ="));
  }

  @Test
  void keepsTheEmptyItemsBetweenAndAfterCommas() {
    assertEquals(
        Map.of(TAGS, List.of("a", "", "b", "")), SettingsParser.parseSettings("tags = a,,b,"));
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

  @Test
  void keepsSpacesAndCommasInsideQuotes() {
    assertEquals(
        Map.of("names", List.of("Lovelace, Ada", " Grace ")),
        SettingsParser.parseSettings("names = \"Lovelace, Ada\", \" Grace \""));
  }

  @Test
  void readsEscapedQuoteAndEscapedBackslash() {
    assertEquals(
        Map.of("motto", List.of("say \"hi\"", "c:\\dir")),
        SettingsParser.parseSettings("motto = \"say \\\"hi\\\"\", \"c:\\\\dir\""));
  }

  @Test
  void keepsBackslashBeforeAnyOtherCharacter() {
    assertEquals(
        Map.of("text", List.of("a\\nb")), SettingsParser.parseSettings("text = \"a\\nb\""));
  }

  @Test
  void ignoresSpacesAroundQuotedItems() {
    assertEquals(
        Map.of(TAGS, List.of("a", "b", "c")),
        SettingsParser.parseSettings("tags =   \"a\"  ,  \"b\"   ,c"));
  }

  @Test
  void readsTwoQuotesAsEmptyItem() {
    assertEquals(Map.of(TAGS, List.of("")), SettingsParser.parseSettings("tags = \"\""));
    assertEquals(Map.of(TAGS, List.of("", "a")), SettingsParser.parseSettings("tags = \"\",a"));
  }

  @Test
  void keepsEmptyItemAfterQuotedOne() {
    assertEquals(Map.of(TAGS, List.of("a", "")), SettingsParser.parseSettings("tags = \"a\","));
  }

  @Test
  void keepsEqualsSignAndHashInsideQuotes() {
    assertEquals(
        Map.of("pairs", List.of("k=v", "#x")),
        SettingsParser.parseSettings("pairs = \"k=v\", \"#x\""));
  }

  @Test
  void treatsQuoteAfterTextAsOrdinary() {
    assertEquals(
        Map.of(TAGS, List.of("x\"y", "z\"")), SettingsParser.parseSettings("tags = x\"y, z\""));
  }

  @Test
  void worksWithKeyPlus() {
    assertEquals(
        Map.of("folders", List.of("a", "b, c")),
        SettingsParser.parseSettings("folders = a\nfolders+ = \"b, c\""));
  }

  @Test
  void rejectsTextAfterClosingQuote() {
    assertRejected("Line 2: unexpected text after closing quote", "# x\ntags = \"a\" b");
    assertRejected("Line 1: unexpected text after closing quote", "tags = \"a\" bc, \"d");
    assertRejected("Line 1: unexpected text after closing quote", "tags = \"x\"\"y\"");
  }

  @Test
  void rejectsQuoteThatIsNeverClosed() {
    assertRejected("Line 1: unterminated quote", "tags = \"a, b");
    assertRejected("Line 1: unterminated quote", "tags = \"a\\\"");
    assertRejected("Line 1: unterminated quote", "tags = \"a\\");
    assertRejected("Line 3: unterminated quote", "ok = 1\n\ntags = x, \"y");
  }

  @Test
  void keepsEmptyItemBeforeLeadingComma() {
    assertEquals(Map.of(TAGS, List.of("", "a")), SettingsParser.parseSettings("tags = ,a"));
  }

  @Test
  void appendsToEmptyList() {
    assertEquals(
        Map.of("folders", List.of("b")), SettingsParser.parseSettings("folders =\nfolders+ = b"));
  }
}
