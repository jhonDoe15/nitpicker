package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsResolverTest {
  private static final String MAIN = "main";
  private static final String BASE = "base";

  private static Resolution.Resolved resolved(Map<String, List<String>> settings) {
    return new Resolution.Resolved(settings);
  }

  @Test
  void resolvesSourceWithoutIncludesLikeParseSettings() {
    assertEquals(
        resolved(Map.of("name", List.of("Ada"))),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "name = Ada")));
  }

  @Test
  void splicesIncludedSourceInPlaceOfTheIncludeLine() {
    Map<String, String> sources =
        Map.of(
            MAIN, "name = Ada\n  include =  base  \nlang = fr",
            BASE, "lang = en\ncolor = red\nname = Nobody");

    assertEquals(
        resolved(Map.of("name", List.of("Nobody"), "lang", List.of("fr"), "color", List.of("red"))),
        SettingsResolver.resolveSettings(MAIN, sources));
  }

  @Test
  void letsLinesAfterIncludeAppendToWhatItBroughtIn() {
    Map<String, String> sources = Map.of(MAIN, "p = 1\ninclude=more\np+ = 4", "more", "p+ = 2, 3");

    assertEquals(
        resolved(Map.of("p", List.of("1", "2", "3", "4"))),
        SettingsResolver.resolveSettings(MAIN, sources));
  }

  @Test
  void expandsIncludesOfIncludesAndSourceIncludedTwice() {
    Map<String, String> sources =
        Map.of(
            "a", "include=b\ninclude=c\nx+ = a",
            "b", "include=d\nx+ = b",
            "c", "include=d\nx+ = c",
            "d", "x+ = d");

    assertEquals(
        resolved(Map.of("x", List.of("d", "b", "d", "c", "a"))),
        SettingsResolver.resolveSettings("a", sources));
  }

  @Test
  void onlyTreatsLinesWhoseKeyIsExactlyIncludeAsDirectives() {
    Map<String, String> sources =
        Map.of(
            MAIN,
            "# include=base\ninclude2 = base\nnote = include=base\nInclude = base\ninclude+ = base",
            BASE,
            "x = 1");

    assertEquals(
        resolved(
            Map.of(
                "include2", List.of(BASE),
                "note", List.of("include=base"),
                "Include", List.of(BASE),
                "include", List.of(BASE))),
        SettingsResolver.resolveSettings(MAIN, sources));
  }

  @Test
  void readsDirectiveWhoseNameHasAnEqualsSignAfterTheFirstOne() {
    assertEquals(
        new Resolution.MissingSource("a = b"),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "include = a = b")));
  }

  @Test
  void readsIncludeLineThatEndsWithCarriageReturn() {
    Map<String, String> sources = Map.of(MAIN, "include = base\r\nx = 1", BASE, "y = 2");

    assertEquals(
        resolved(Map.of("y", List.of("2"), "x", List.of("1"))),
        SettingsResolver.resolveSettings(MAIN, sources));
  }

  @Test
  void readsQuotedValuesOfEverySource() {
    Map<String, String> sources =
        Map.of(MAIN, "include=base\nown = \"p, q\"", BASE, "n = \"a, b\"");

    assertEquals(
        resolved(Map.of("n", List.of("a, b"), "own", List.of("p, q"))),
        SettingsResolver.resolveSettings(MAIN, sources));
  }

  @Test
  void reportsEntryOrIncludedNameThatIsNotThere() {
    assertEquals(
        new Resolution.MissingSource(MAIN), SettingsResolver.resolveSettings(MAIN, Map.of()));
    assertEquals(
        new Resolution.MissingSource("toString"),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "include = toString")));
  }

  @Test
  void reportsMissingSourceWhereverTheIncludeSits() {
    assertEquals(
        new Resolution.MissingSource("none"),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "include = none\nx = 1")));
    assertEquals(
        new Resolution.MissingSource("none"),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "x = 1\ninclude = none\ny = 2")));
  }

  @Test
  void reportsIncludeWithoutNameAndTheSourceThatHoldsIt() {
    assertEquals(
        new Resolution.EmptyInclude(MAIN),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "x = 1\ninclude =  ")));
    assertEquals(
        new Resolution.EmptyInclude(BASE),
        SettingsResolver.resolveSettings(MAIN, Map.of(MAIN, "include = base", BASE, "include=")));
  }

  @Test
  void reportsCycleWithTheChainFromTheEntry() {
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "a")),
        SettingsResolver.resolveSettings("a", Map.of("a", "include = a")));
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "b", "a")),
        SettingsResolver.resolveSettings("a", Map.of("a", "include = b", "b", "include = a")));
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "b", "c", "b")),
        SettingsResolver.resolveSettings(
            "a", Map.of("a", "include=b", "b", "x = 1\ninclude=c", "c", "include=b")));
  }

  @Test
  void repeatedIncludeIsNoCycle() {
    Map<String, String> sources =
        Map.of("a", "include=b\ninclude=c", "b", "include=c\nx = b", "c", "x = c");

    assertEquals(
        resolved(Map.of("x", List.of("c"))), SettingsResolver.resolveSettings("a", sources));
  }

  @Test
  void throwsWhatParseSettingsThrowsForTheExpandedText() {
    Map<String, String> malformed = Map.of(MAIN, "a = 1\ninclude=base\nz = 3", BASE, "oops");
    Map<String, String> unterminated = Map.of(MAIN, "include=base", BASE, "a = \"x");

    IllegalArgumentException expected =
        assertThrows(
            IllegalArgumentException.class,
            () -> SettingsResolver.resolveSettings(MAIN, malformed));
    IllegalArgumentException quote =
        assertThrows(
            IllegalArgumentException.class,
            () -> SettingsResolver.resolveSettings(MAIN, unterminated));

    assertEquals("Line 2: expected key=value", expected.getMessage());
    assertEquals("Line 1: unterminated quote", quote.getMessage());
  }
}
