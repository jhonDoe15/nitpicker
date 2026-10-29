package com.example.settings;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Command line entry point: prints the settings of the files named by its arguments. */
public final class Cli {
  private Cli() {}

  public static void main(String... args) {
    printFiles(Arrays.stream(args).map(Path::of).toList(), System.out::print);
  }

  /** Prints the settings of the first file, with the include directives it makes to the others. */
  public static void printFiles(List<Path> files, Output output) {
    Map<String, String> sources = new LinkedHashMap<>();
    for (Path file : files) {
      sources.put(file.toString(), read(file));
    }
    SettingsPrinter.printResolved(files.get(0).toString(), sources, output);
  }

  private static String read(Path file) {
    try {
      return Files.readString(file);
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + file, e);
    }
  }
}
