package shop.loading;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

public interface Shapes {
  boolean READY = Files.exists(Path.of("shapes.ready")); // violation: ClassLoadEffect
  Path SCRATCH = scratch();

  static Path scratch() {
    try {
      return Files.createTempFile("shapes", ".tmp"); // violation: ClassLoadEffect
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }

  enum Mode {
    FAST {
      private final boolean cached = Files.exists(Path.of("fast.cache")); // violation: ClassLoadEffect

      @Override
      boolean cached() {
        return cached;
      }
    },
    SLOW;

    boolean cached() {
      return false;
    }
  }

  record Point(int x, int y) {
    static final Point ORIGIN = new Point(0, 0);

    public Point {
      if (Files.exists(Path.of("points.lock"))) { // violation: ClassLoadEffect
        throw new IllegalStateException("points are locked");
      }
    }
  }
}
