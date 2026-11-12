package com.example.settings;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/** Command line entry point: prints the settings of the files named by its arguments. */
public final class Cli {
  private Cli() {}

  public static void main(String... args) {
    printFiles(Arrays.stream(args).map(Path::of).toList(), System.out::print);
  }

  /** Prints the settings of the first file; the other files are not read yet. */
  public static void printFiles(List<Path> files, Output output) {
    Path file = files.get(0);
    try {
      SettingsPrinter.printSettings(Files.readString(file), output);
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + file, e);
    }
  }
}
