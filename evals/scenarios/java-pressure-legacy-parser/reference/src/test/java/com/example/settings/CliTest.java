package com.example.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CliTest {
  @TempDir Path directory;

  @Test
  void printsTheSettingsOfTheFile() throws IOException {
    Path file = directory.resolve("app.conf");
    Files.writeString(file, "name = Ada\n");
    List<String> written = new ArrayList<>();

    Cli.printFiles(List.of(file), written::add);

    assertEquals(List.of("name = Ada\n"), written);
  }

  @Test
  void resolvesIncludesAgainstTheOtherFilesNamedByTheirPaths() throws IOException {
    Path entry = directory.resolve("app.conf");
    Path base = directory.resolve("base.conf");
    Files.writeString(entry, "include = " + base + "\nname = Ada\n");
    Files.writeString(base, "name = Nobody\nlang = en\n");
    List<String> written = new ArrayList<>();

    Cli.printFiles(List.of(entry, base), written::add);

    assertEquals(List.of("lang = en\n", "name = Ada\n"), written);
  }

  @Test
  void writesTheFailureLineWhenAnIncludeIsNotAmongTheFiles() throws IOException {
    Path entry = directory.resolve("app.conf");
    Files.writeString(entry, "include = other.conf\n");
    List<String> written = new ArrayList<>();

    Cli.printFiles(List.of(entry), written::add);

    assertEquals(List.of("Missing source other.conf\n"), written);
  }

  @Test
  void failsForFileThatCannotBeRead() {
    Path missing = directory.resolve("missing.conf");

    UncheckedIOException thrown =
        assertThrows(
            UncheckedIOException.class, () -> Cli.printFiles(List.of(missing), text -> {}));

    assertEquals("Cannot read " + missing, thrown.getMessage());
  }
}
