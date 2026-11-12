package shop.loading;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class Holders {
  static final List<String> EMPTY = List.of();
  static final String NAME = Objects.toString("holders");
  static final String SIZE = read(3);

  private Holders() {}

  static Connection connection() {
    return Lazy.CONNECTION;
  }

  static String read(int size) {
    return "size " + size;
  }

  static String read(String file) {
    try {
      return Files.readString(Path.of(file));
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }

  static List<String> of() {
    try {
      return Files.readAllLines(Path.of("holders.txt"));
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }

  String toString(Object value) {
    return read(String.valueOf(value));
  }

  private static Connection open() {
    try {
      return DriverManager.getConnection("jdbc:h2:mem:holders");
    } catch (SQLException error) {
      throw new IllegalStateException(error);
    }
  }

  private static final class Lazy {
    static final Connection CONNECTION = open();
  }

  static final class Money {
    static final Money ZERO = new Money(0);
    private final long cents;

    private Money(long cents) {
      this.cents = cents;
    }

    Money(String file) {
      this(Files.exists(Path.of(file)) ? 1 : 0);
    }

    long cents() {
      return cents;
    }
  }

  static final class Settings {
    static final Settings EMPTY = new Settings(Map.of());
    private final Map<String, String> values;

    private Settings(Map<String, String> values) {
      this.values = values;
    }

    Settings(Path file) throws IOException {
      this(Map.of("lines", String.valueOf(Files.readAllLines(file).size())));
    }

    Map<String, String> values() {
      return values;
    }
  }
}
