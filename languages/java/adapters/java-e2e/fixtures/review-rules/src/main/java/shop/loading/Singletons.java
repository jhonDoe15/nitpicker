package shop.loading;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

public final class Singletons {
  static final Map<String, Boolean> FLAGS = new HashMap<>() {
    {
      put("debug", Files.exists(Path.of("debug.flag"))); // violation: ClassLoadEffect
    }
  };
  static final Object PROBE = new Object() {
    private final boolean present = Files.isDirectory(Path.of("probe")); // violation: ClassLoadEffect

    @Override
    public String toString() {
      return String.valueOf(present);
    }
  };

  private Singletons() {}

  static final class Registry {
    static final Registry INSTANCE = new Registry();
    private final String data;

    {
      createLogs();
    }

    private Registry() {
      data = load();
    }

    private static void createLogs() {
      try {
        Files.createDirectories(Path.of("logs")); // violation: ClassLoadEffect
      } catch (IOException error) {
        throw new UncheckedIOException(error);
      }
    }

    private String load() {
      try {
        return Files.readString(Path.of("registry.txt")); // violation: ClassLoadEffect
      } catch (IOException error) {
        throw new UncheckedIOException(error);
      }
    }

    String data() {
      return data;
    }
  }

  static final class Made {
    private static final Made INSTANCE = create();

    private Made() {
      Files.isWritable(Path.of("made")); // violation: ClassLoadEffect
    }

    private static Made create() {
      return new Made();
    }

    static Made instance() {
      return INSTANCE;
    }
  }

  static final class Box<T> {
    static final Box<String> SHARED = new Box<>();

    Box() {
      Files.isReadable(Path.of("box")); // violation: ClassLoadEffect
    }
  }

  static final class Late {
    static final Late INSTANCE;

    static {
      INSTANCE = new Late();
    }

    private Late() {
      Files.notExists(Path.of("late")); // violation: ClassLoadEffect
    }
  }
}
