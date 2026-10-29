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
  void failsForFileThatCannotBeRead() {
    Path missing = directory.resolve("missing.conf");

    UncheckedIOException thrown =
        assertThrows(
            UncheckedIOException.class, () -> Cli.printFiles(List.of(missing), text -> {}));

    assertEquals("Cannot read " + missing, thrown.getMessage());
  }
}
