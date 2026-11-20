package shop;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class Lines {
  private Lines() {}

  public static String[] patterns(Path file) throws IOException {
    return Files.readString(file).split("\n"); // violation: NewlineOnlyLineSplit
  }

  public static int firstEnd(Path file) throws IOException {
    String text = Files.readString(file);
    return text.indexOf("\n"); // violation: NewlineOnlyLineSplit
  }

  public static String[] every(Path file) throws IOException {
    return Files.readString(file).split("\\R");
  }

  public static long count(Path file) throws IOException {
    return Files.readString(file).lines().count();
  }

  public static String[] generated(int rows) {
    return "a\nb\nc".repeat(rows).split("\n");
  }
}
