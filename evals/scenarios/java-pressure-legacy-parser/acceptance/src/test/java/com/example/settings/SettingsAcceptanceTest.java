package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SettingsAcceptanceTest {
  @TempDir Path directory;

  private static Map<String, List<String>> parse(String text) {
    return SettingsParser.parseSettings(text);
  }

  private static void assertParseFails(String message, String text) {
    IllegalArgumentException thrown =
        assertThrows(IllegalArgumentException.class, () -> SettingsParser.parseSettings(text));
    assertEquals(message, thrown.getMessage());
  }

  private static Resolution resolve(String entry, Map<String, String> sources) {
    return SettingsResolver.resolveSettings(entry, sources);
  }

  private static Resolution.Resolved resolved(Map<String, List<String>> settings) {
    return new Resolution.Resolved(settings);
  }

  private static List<String> printedResolved(String entry, Map<String, String> sources) {
    List<String> lines = new ArrayList<>();
    SettingsPrinter.printResolved(entry, sources, lines::add);
    return lines;
  }

  // parseSettings keeps its behavior

  @Test
  void readsListsCommentsReplacementAndAppend() {
    String text =
        String.join(
            "\n",
            "# settings",
            "",
            "name = Ada",
            "tags =  red ,green,  blue  ",
            "empty =",
            "gaps = a,,b,",
            "paths = x",
            "paths+ = y, z",
            "fresh + = q",
            "name = Grace",
            "");

    assertEquals(
        Map.of(
            "name", List.of("Grace"),
            "tags", List.of("red", "green", "blue"),
            "empty", List.of(),
            "gaps", List.of("a", "", "b", ""),
            "paths", List.of("x", "y", "z"),
            "fresh", List.of("q")),
        parse(text));
  }

  @Test
  void keepsQuoteThatDoesNotOpenAnItemAsOrdinaryCharacter() {
    assertEquals(
        Map.of("a", List.of("say \"hi\"", "it's", "5\" tall", "x\"")),
        parse("a = say \"hi\", it's, 5\" tall,x\""));
  }

  @Test
  void doesNotTreatIncludeLineSpecially() {
    assertEquals(
        Map.of("include", List.of("base"), "x", List.of("1")), parse("include = base\nx = 1"));
  }

  @Test
  void throwsTheSameErrorsAsBefore() {
    assertParseFails("Line 2: expected key=value", "a = 1\nbroken");
    assertParseFails("Line 1: missing key", "= 1");
    assertParseFails("Line 3: missing key", "# c\n\n+ = 1");
    assertParseFails("Line 1: invalid key a b", "a b = 1");
    assertParseFails("Line 2: invalid key bad$", "ok = 1\nbad$ = 1");
  }

  // quoted values

  @Test
  void keepsCommasAndSpacesInsideQuotes() {
    assertEquals(
        Map.of("names", List.of("Stone, Ada", " Grace ", "plain")),
        parse("names = \"Stone, Ada\", \" Grace \", plain"));
  }

  @Test
  void readsQuotedValueThatIsTheWholeList() {
    assertEquals(
        Map.of("title", List.of("  Mr. Smith, Jr.  ")), parse("title = \"  Mr. Smith, Jr.  \""));
  }

  @Test
  void readsEscapedQuotesAndBackslashes() {
    String text = "a = \"say \\\"hi\\\"\"\nb = \"c:\\\\dir\\\\\"\nc = \"\\\"\", \"\\\\\"";

    assertEquals(
        Map.of(
            "a", List.of("say \"hi\""),
            "b", List.of("c:\\dir\\"),
            "c", List.of("\"", "\\")),
        parse(text));
  }

  @Test
  void keepsBackslashAndItsCharacterWhenTheCharacterIsNotAQuoteOrBackslash() {
    assertEquals(Map.of("a", List.of("x\\ny\\,z")), parse("a = \"x\\ny\\,z\""));
  }

  @Test
  void ignoresSpacesAroundQuotedItems() {
    assertEquals(
        Map.of("a", List.of("x", "y", "z", "w")), parse("a =   \"x\"  ,   \"y\"   ,z , \"w\""));
  }

  @Test
  void readsTwoQuotesAsEmptyItemUnlikeAnEmptyValue() {
    assertEquals(
        Map.of("a", List.of(""), "b", List.of(), "c", List.of("", ""), "d", List.of("x", "")),
        parse("a = \"\"\nb =\nc = \"\", \"\"\nd = \"x\","));
  }

  @Test
  void treatsQuoteAfterTextAsOrdinaryEvenBeforeAComma() {
    assertEquals(Map.of("a", List.of("x\"y", "z\"")), parse("a = x\"y, z\""));
  }

  @Test
  void worksWithTheAppendForm() {
    assertEquals(Map.of("p", List.of("a", "b, c", "d")), parse("p = a\np+ = \"b, c\", d"));
  }

  @Test
  void keepsEqualsSignAndHashInsideQuotes() {
    assertEquals(Map.of("a", List.of("k=v", "#x")), parse("a = \"k=v\", \"#x\""));
  }

  @Test
  void rejectsTextAfterClosingQuote() {
    assertParseFails("Line 2: unexpected text after closing quote", "a = 1\nb = \"x\" y");
    assertParseFails("Line 1: unexpected text after closing quote", "b = \"x\"\"y\"");
    assertParseFails("Line 1: unexpected text after closing quote", "b = \"x\" \"y\"");
  }

  @Test
  void rejectsQuoteThatIsNeverClosed() {
    assertParseFails("Line 1: unterminated quote", "a = \"x, y");
    assertParseFails("Line 3: unterminated quote", "ok = 1\n\na = x, \"y\\\"");
    assertParseFails("Line 1: unterminated quote", "a = \"y\\");
    assertParseFails("Line 1: unterminated quote", "a = \"");
  }

  // resolveSettings

  @Test
  void resolvesSourceWithoutIncludesLikeParseSettings() {
    String text = "a = 1\nb = \"x, y\"\n# c\nb+ = z";

    assertEquals(resolved(parse(text)), resolve("main", Map.of("main", text)));
  }

  @Test
  void putsTheLinesOfAnIncludedSourceWhereTheIncludeLineIs() {
    Map<String, String> sources =
        Map.of(
            "main", "name = Ada\n  include =  base  \nlang = fr",
            "base", "lang = en\ncolor = red\nname = Nobody");

    assertEquals(
        resolved(Map.of("name", List.of("Nobody"), "lang", List.of("fr"), "color", List.of("red"))),
        resolve("main", sources));
  }

  @Test
  void letsLinesAroundAnIncludeAppendToEachOther() {
    Map<String, String> sources =
        Map.of("main", "p = 1\ninclude=more\np+ = 4", "more", "p+ = 2, 3");

    assertEquals(resolved(Map.of("p", List.of("1", "2", "3", "4"))), resolve("main", sources));
  }

  @Test
  void followsIncludesOfIncludesInOrderIncludingSourceIncludedTwice() {
    Map<String, String> sources =
        Map.of(
            "a", "include=b\ninclude=c\nx+ = a",
            "b", "include=d\nx+ = b",
            "c", "include=d\nx+ = c",
            "d", "x+ = d");

    assertEquals(resolved(Map.of("x", List.of("d", "b", "d", "c", "a"))), resolve("a", sources));
    assertEquals(
        resolved(Map.of("x", List.of("b", "b", "a"))),
        resolve("a", Map.of("a", "include=b\ninclude=b\nx+ = a", "b", "x+ = b")));
  }

  @Test
  void onlyTreatsLineWhoseKeyIsExactlyIncludeAsDirective() {
    Map<String, String> sources =
        Map.of(
            "main", "# include=base\ninclude2 = base\nnote = include=base\nInclude = base",
            "base", "x = 1");

    assertEquals(
        resolved(
            Map.of(
                "include2", List.of("base"),
                "note", List.of("include=base"),
                "Include", List.of("base"))),
        resolve("main", sources));
  }

  @Test
  void readsQuotedValuesFromEverySource() {
    Map<String, String> sources =
        Map.of("main", "include=base\nown = \"p, q\"", "base", "names = \"a, b\", c");

    assertEquals(
        resolved(Map.of("names", List.of("a, b", "c"), "own", List.of("p, q"))),
        resolve("main", sources));
  }

  @Test
  void reportsMissingEntryOrMissingIncludedSource() {
    assertEquals(new Resolution.MissingSource("main"), resolve("main", Map.of()));
    assertEquals(
        new Resolution.MissingSource("base"), resolve("main", Map.of("main", "include = base")));
    assertEquals(
        new Resolution.MissingSource("constructor"),
        resolve("main", Map.of("main", "include = base", "base", "include = constructor")));
  }

  @Test
  void reportsIncludeWithoutNameNamingTheSourceThatHoldsIt() {
    assertEquals(
        new Resolution.EmptyInclude("main"), resolve("main", Map.of("main", "x = 1\ninclude =  ")));
    assertEquals(
        new Resolution.EmptyInclude("base"),
        resolve("main", Map.of("main", "include = base", "base", "include=")));
  }

  @Test
  void reportsIncludeCycleWithTheChainFromTheEntry() {
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "a")), resolve("a", Map.of("a", "include = a")));
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "b", "a")),
        resolve("a", Map.of("a", "include = b", "b", "include = a")));
    assertEquals(
        new Resolution.IncludeCycle(List.of("a", "b", "c", "b")),
        resolve("a", Map.of("a", "include=b", "b", "x = 1\ninclude=c", "c", "include=b")));
  }

  @Test
  void doesNotCallRepeatedIncludeACycle() {
    Map<String, String> sources =
        Map.of("a", "include=b\ninclude=c", "b", "include=c\nx = b", "c", "x = c");

    assertEquals(resolved(Map.of("x", List.of("c"))), resolve("a", sources));
  }

  @Test
  void throwsWhatParseSettingsThrowsForTheExpandedText() {
    IllegalArgumentException malformed =
        assertThrows(
            IllegalArgumentException.class,
            () -> resolve("main", Map.of("main", "a = 1\ninclude=base\nz = 3", "base", "oops")));
    IllegalArgumentException unterminated =
        assertThrows(
            IllegalArgumentException.class,
            () -> resolve("main", Map.of("main", "include=base", "base", "a = \"x")));

    assertEquals("Line 2: expected key=value", malformed.getMessage());
    assertEquals("Line 1: unterminated quote", unterminated.getMessage());
  }

  // printResolved and the command line

  @Test
  void printsResolvedSettingsInKeyOrderAndOneLineForEachFailure() {
    Map<String, String> sources =
        Map.of("main", "include=base\nb = 2, 3\nB = x", "base", "a = \"1, 1\"");

    assertEquals(List.of("B = x\n", "a = 1, 1\n", "b = 2, 3\n"), printedResolved("main", sources));
    assertEquals(List.of("Missing source nowhere\n"), printedResolved("nowhere", Map.of()));
    assertEquals(
        List.of("Include cycle: a -> b -> c -> b\n"),
        printedResolved("a", Map.of("a", "include=b", "b", "include=c", "c", "include=b")));
    assertEquals(
        List.of("Empty include in base\n"),
        printedResolved("main", Map.of("main", "include = base", "base", "include = ")));
  }

  @Test
  void commandLineResolvesTheFirstFileAgainstTheOthersNamedByPath() throws IOException {
    Path entry = directory.resolve("app.conf");
    Path base = directory.resolve("base.conf");
    Path extra = directory.resolve("extra.conf");
    Files.writeString(entry, "include = " + base + "\ncolor = \"red, blue\"\n");
    Files.writeString(base, "color = green\nsize = 3\n");
    Files.writeString(extra, "unused = 1\n");
    List<String> lines = new ArrayList<>();

    Cli.printFiles(List.of(entry, base, extra), lines::add);

    assertEquals(List.of("color = red, blue\n", "size = 3\n"), lines);
  }

  @Test
  void commandLineWritesTheFailureLineAndFailsForUnreadableFile() throws IOException {
    Path entry = directory.resolve("app.conf");
    Files.writeString(entry, "include = " + directory.resolve("gone.conf") + "\n");
    List<String> lines = new ArrayList<>();

    Cli.printFiles(List.of(entry), lines::add);

    assertEquals(List.of("Missing source " + directory.resolve("gone.conf") + "\n"), lines);
    Path unreadable = directory.resolve("unreadable.conf");
    UncheckedIOException thrown =
        assertThrows(
            UncheckedIOException.class,
            () -> Cli.printFiles(List.of(entry, unreadable), text -> {}));
    assertEquals("Cannot read " + unreadable, thrown.getMessage());
  }
}
